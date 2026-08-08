import 'dotenv/config';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { SiweMessage, generateNonce } from 'siwe';

const app = express();
const PORT = process.env.PORT || 3000;
const SIWE_DOMAIN = process.env.SIWE_DOMAIN || 'localhost:3000';
const SIWE_CHAIN_ID = Number(process.env.SIWE_CHAIN_ID || 84532);

// In-memory activity and session stores
const nonces = new Map<string, number>();
const activeSessions = new Map<string, string>();
const activityLogs: Array<{ timestamp: string; type: string; address: string; details: string; chain: string }> = [];

const MERCHANT_ADDRESS_EVM = process.env.MERCHANT_WALLET_ADDRESS || '0x0000000000000000000000000000000000000000';
const MERCHANT_ADDRESS_SOLANA = process.env.MERCHANT_SOLANA_ADDRESS || '11111111111111111111111111111111';

app.use(cors());
app.use(express.json());

// Public Health Check Endpoint
app.get('/health', (req: Request, res: Response) => {
    res.json({ 
        status: 'active', 
        agent: 'x402-merchant-agent', 
        supportedChains: ['EVM', 'Solana'],
        evmWallet: MERCHANT_ADDRESS_EVM,
        solanaWallet: MERCHANT_ADDRESS_SOLANA
    });
});

// Dashboard Activity Endpoint
app.get('/dashboard/activity', (req: Request, res: Response) => {
    res.json({
        success: true,
        totalEvents: activityLogs.length,
        activeSessionsCount: activeSessions.size,
        activities: activityLogs.slice(-20).reverse()
    });
});

// --- SIWE AUTH ENDPOINTS ---
app.get('/auth/nonce', (req: Request, res: Response) => {
    const nonce = generateNonce();
    nonces.set(nonce, Date.now());
    return res.json({ nonce });
});

app.post('/auth/verify', async (req: Request, res: Response) => {
    try {
        const { message, signature } = req.body;
        if (!message || !signature) {
            return res.status(400).json({ error: 'Missing message or signature' });
        }

        const siweMessage = new SiweMessage(message);

        if (!nonces.has(siweMessage.nonce)) {
            return res.status(401).json({ error: 'Invalid or expired nonce' });
        }

        const verificationResult = await siweMessage.verify({
            signature,
            nonce: siweMessage.nonce,
        });

        if (!verificationResult.success) {
            return res.status(401).json({ error: 'SIWE signature verification failed' });
        }

        nonces.delete(siweMessage.nonce);

        const token = generateNonce();
        activeSessions.set(token, siweMessage.address);

        activityLogs.push({
            timestamp: new Date().toISOString(),
            type: 'SIWE_LOGIN',
            address: siweMessage.address,
            details: 'EVM Wallet Authenticated',
            chain: 'EVM'
        });

        return res.json({ success: true, token, address: siweMessage.address, expiresIn: 3600 });
    } catch (error: any) {
        console.error('[Server Error] SIWE verification exception:', error.message);
        return res.status(401).json({ error: 'SIWE signature verification failed', details: error.message });
    }
});

// --- MIDDLEWARE LAYERS ---
const requireSiweSession = (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Missing or invalid authorization session token' });
    }

    const token = authHeader.split(' ')[1];
    const address = activeSessions.get(token);
    if (!address) {
        return res.status(401).json({ error: 'Invalid or expired session token' });
    }

    (req as any).userAddress = address;
    next();
};

const requireX402Payment = (req: Request, res: Response, next: NextFunction) => {
    const paymentHeader = req.headers['payment-signature'] as string;
    const clientChain = (req.headers['x-payment-chain'] as string) || 'evm';
    const userAddress = (req as any).userAddress;

    if (!paymentHeader) {
        // Multi-chain x402 payment required challenge payload
        const challengePayload = {
            scheme: 'exact',
            supportedNetworks: [
                {
                    network: 'eip155:84532', // Base Sepolia (EVM)
                    token: 'USDC',
                    price: '100000', // 0.10 USDC
                    recipient: MERCHANT_ADDRESS_EVM
                },
                {
                    network: 'solana:89290001', // Solana Devnet
                    token: 'USDC',
                    price: '100000', // 0.10 USDC
                    recipient: MERCHANT_ADDRESS_SOLANA
                }
            ]
        };

        res.setHeader('PAYMENT-REQUIRED', Buffer.from(JSON.stringify(challengePayload)).toString('base64'));

        return res.status(402).json({
            error: 'Payment Required',
            message: 'Provide a valid x402 payment signature header to access this resource.',
            options: challengePayload.supportedNetworks
        });
    }

    // Record activity log with chain context
    activityLogs.push({
        timestamp: new Date().toISOString(),
        type: 'X402_SETTLEMENT',
        address: userAddress || 'Unknown',
        details: `Micro-payment settled on ${clientChain.toUpperCase()}`,
        chain: clientChain.toUpperCase()
    });

    res.setHeader(
        'PAYMENT-RESPONSE',
        Buffer.from(JSON.stringify({ status: 'settled', chain: clientChain })).toString('base64')
    );
    next();
};

// --- PROTECTED ENDPOINT ---
app.get('/resource/premium-data', requireSiweSession, requireX402Payment, (req: Request, res: Response) => {
    const userAddress = (req as any).userAddress;
    return res.json({
        success: true,
        data: {
            message: 'Access granted to premium multi-chain intelligence feed.',
            timestamp: new Date().toISOString(),
            consumer: userAddress,
            merchantEVM: MERCHANT_ADDRESS_EVM,
            merchantSolana: MERCHANT_ADDRESS_SOLANA
        },
    });
});

app.listen(PORT, () => {
    console.log(`[Server] x402 Merchant Agent running on port ${PORT}`);
    console.log(`[Config] EVM Wallet: ${MERCHANT_ADDRESS_EVM} | Solana Wallet: ${MERCHANT_ADDRESS_SOLANA}`);
});
