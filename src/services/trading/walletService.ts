import {
  Connection,
  Keypair,
  PublicKey,
  LAMPORTS_PER_SOL,
  Transaction,
  SystemProgram,
  sendAndConfirmTransaction,
  VersionedTransaction
} from '@solana/web3.js';
import {
  getAssociatedTokenAddress,
  getAccount,
  TokenAccountNotFoundError,
  createAssociatedTokenAccountInstruction
} from '@solana/spl-token';
import bs58 from 'bs58';
import Decimal from 'decimal.js';
import logger from '../../utils/logger';
import { config } from '../../config';

export class WalletService {
  private connection: Connection;
  private wallet: Keypair | null = null;
  private publicKey: PublicKey | null = null;
  
  constructor() {
    const cfg = config.get();
    this.connection = new Connection(cfg.solanaRpcUrl, 'confirmed');
    this.initializeWallet();
  }

  /**
   * Initialize wallet from private key
   */
  private initializeWallet(): void {
    const cfg = config.get();
    
    if (cfg.walletPrivateKey) {
      try {
        // Try to parse as base58 encoded private key
        const privateKeyBytes = bs58.decode(cfg.walletPrivateKey);
        this.wallet = Keypair.fromSecretKey(privateKeyBytes);
        this.publicKey = this.wallet.publicKey;
        logger.info(`Wallet initialized: ${this.publicKey.toString()}`);
      } catch (error) {
        logger.error('Failed to initialize wallet from private key:', error);
        
        // Generate a new wallet for paper trading
        if (cfg.paperTrading) {
          this.wallet = Keypair.generate();
          this.publicKey = this.wallet.publicKey;
          logger.warn(`Generated new wallet for paper trading: ${this.publicKey.toString()}`);
        }
      }
    } else if (cfg.paperTrading) {
      // Generate a new wallet for paper trading
      this.wallet = Keypair.generate();
      this.publicKey = this.wallet.publicKey;
      logger.info(`Generated new wallet for paper trading: ${this.publicKey.toString()}`);
    } else {
      logger.error('No wallet configured and not in paper trading mode');
    }
  }

  /**
   * Get wallet public key
   */
  public getPublicKey(): PublicKey | null {
    return this.publicKey;
  }

  /**
   * Get SOL balance
   */
  public async getSOLBalance(): Promise<Decimal> {
    if (!this.publicKey) {
      logger.error('Wallet not initialized');
      return new Decimal(0);
    }

    try {
      const balance = await this.connection.getBalance(this.publicKey);
      return new Decimal(balance).div(LAMPORTS_PER_SOL);
    } catch (error) {
      logger.error('Failed to get SOL balance:', error);
      return new Decimal(0);
    }
  }

  /**
   * Get token balance for a specific mint
   */
  public async getTokenBalance(mintAddress: PublicKey): Promise<Decimal> {
    if (!this.publicKey) {
      logger.error('Wallet not initialized');
      return new Decimal(0);
    }

    try {
      const tokenAccount = await getAssociatedTokenAddress(
        mintAddress,
        this.publicKey
      );
      
      const accountInfo = await getAccount(this.connection, tokenAccount);
      return new Decimal(accountInfo.amount.toString()).div(new Decimal(10).pow(9)); // Assuming 9 decimals
    } catch (error) {
      if (error instanceof TokenAccountNotFoundError) {
        logger.debug('Token account not found, balance is 0');
        return new Decimal(0);
      }
      logger.error('Failed to get token balance:', error);
      return new Decimal(0);
    }
  }

  /**
   * Get or create associated token account
   */
  public async getOrCreateTokenAccount(mintAddress: PublicKey): Promise<PublicKey> {
    if (!this.publicKey || !this.wallet) {
      throw new Error('Wallet not initialized');
    }

    const associatedTokenAddress = await getAssociatedTokenAddress(
      mintAddress,
      this.publicKey
    );

    try {
      await getAccount(this.connection, associatedTokenAddress);
      return associatedTokenAddress;
    } catch (error) {
      if (error instanceof TokenAccountNotFoundError) {
        logger.info('Creating associated token account...');
        
        const transaction = new Transaction().add(
          createAssociatedTokenAccountInstruction(
            this.publicKey,
            associatedTokenAddress,
            this.publicKey,
            mintAddress
          )
        );
        
        const signature = await sendAndConfirmTransaction(
          this.connection,
          transaction,
          [this.wallet]
        );
        
        logger.info(`Token account created: ${signature}`);
        return associatedTokenAddress;
      }
      throw error;
    }
  }

  /**
   * Send SOL to another address
   */
  public async sendSOL(
    destination: PublicKey,
    amount: Decimal
  ): Promise<string | null> {
    if (!this.publicKey || !this.wallet) {
      logger.error('Wallet not initialized');
      return null;
    }

    try {
      const lamports = amount.mul(LAMPORTS_PER_SOL).toNumber();
      
      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: this.publicKey,
          toPubkey: destination,
          lamports
        })
      );
      
      const signature = await sendAndConfirmTransaction(
        this.connection,
        transaction,
        [this.wallet]
      );
      
      logger.info(`SOL transfer successful: ${signature}`);
      return signature;
    } catch (error) {
      logger.error('Failed to send SOL:', error);
      return null;
    }
  }

  /**
   * Sign and send a transaction
   */
  public async signAndSendTransaction(
    transaction: Transaction | VersionedTransaction
  ): Promise<string | null> {
    if (!this.wallet) {
      logger.error('Wallet not initialized');
      return null;
    }

    try {
      let signature: string;
      
      if (transaction instanceof VersionedTransaction) {
        transaction.sign([this.wallet]);
        signature = await this.connection.sendTransaction(transaction);
        await this.connection.confirmTransaction(signature, 'confirmed');
      } else {
        signature = await sendAndConfirmTransaction(
          this.connection,
          transaction,
          [this.wallet]
        );
      }
      
      logger.info(`Transaction successful: ${signature}`);
      return signature;
    } catch (error) {
      logger.error('Failed to sign and send transaction:', error);
      return null;
    }
  }

  /**
   * Simulate a transaction (for testing)
   */
  public async simulateTransaction(
    transaction: Transaction | VersionedTransaction
  ): Promise<boolean> {
    try {
      let result;
      if (transaction instanceof VersionedTransaction) {
        result = await this.connection.simulateTransaction(transaction);
      } else {
        result = await this.connection.simulateTransaction(transaction);
      }
      
      if (result.value.err) {
        logger.error('Transaction simulation failed:', result.value.err);
        return false;
      }
      
      logger.info('Transaction simulation successful');
      return true;
    } catch (error) {
      logger.error('Failed to simulate transaction:', error);
      return false;
    }
  }

  /**
   * Get recent transaction history
   */
  public async getTransactionHistory(limit: number = 10): Promise<any[]> {
    if (!this.publicKey) {
      logger.error('Wallet not initialized');
      return [];
    }

    try {
      const signatures = await this.connection.getSignaturesForAddress(
        this.publicKey,
        { limit }
      );
      
      const transactions = await Promise.all(
        signatures.map(async (sig) => {
          const tx = await this.connection.getTransaction(sig.signature, {
            maxSupportedTransactionVersion: 0
          });
          return {
            signature: sig.signature,
            blockTime: sig.blockTime,
            slot: sig.slot,
            err: sig.err,
            memo: sig.memo,
            transaction: tx
          };
        })
      );
      
      return transactions;
    } catch (error) {
      logger.error('Failed to get transaction history:', error);
      return [];
    }
  }

  /**
   * Check if wallet has sufficient balance
   */
  public async hasSufficientBalance(
    amount: Decimal,
    isSOL: boolean = true
  ): Promise<boolean> {
    if (isSOL) {
      const balance = await this.getSOLBalance();
      // Keep some SOL for transaction fees
      const availableBalance = balance.minus(0.01);
      return availableBalance.gte(amount);
    }
    
    // For token balances, implement token-specific logic
    return false;
  }

  /**
   * Get wallet statistics
   */
  public async getWalletStats(): Promise<{
    address: string;
    solBalance: string;
    usdValue: string;
    transactionCount: number;
  }> {
    if (!this.publicKey) {
      return {
        address: 'Not initialized',
        solBalance: '0',
        usdValue: '0',
        transactionCount: 0
      };
    }

    const solBalance = await this.getSOLBalance();
    
    // Get approximate USD value (you would fetch this from price service)
    const solPrice = new Decimal(100); // Placeholder
    const usdValue = solBalance.mul(solPrice);
    
    const signatures = await this.connection.getSignaturesForAddress(
      this.publicKey,
      { limit: 1000 }
    );
    
    return {
      address: this.publicKey.toString(),
      solBalance: solBalance.toFixed(4),
      usdValue: usdValue.toFixed(2),
      transactionCount: signatures.length
    };
  }

  /**
   * Export wallet private key (for backup)
   */
  public exportPrivateKey(): string | null {
    if (!this.wallet) {
      logger.error('Wallet not initialized');
      return null;
    }
    
    return bs58.encode(this.wallet.secretKey);
  }
}
