import express from 'express';
import { paymentMiddleware, x402ResourceServer } from '@x402/express';
import { HTTPFacilitatorClient } from '@x402/core/server';
import { ExactEvmScheme } from '@x402/evm/exact/server';

const app = express();
app.use(express.json());

const MERCHANT_ADDRESS = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';

// Initialize Facilitator Client
const facilitatorClient = new HTTPFacilitatorClient({
    url: 'https://x402.org/facilitator'
});

// Initialize resource server and register EVM scheme
const resourceServer = new x402ResourceServer(facilitatorClient);
resourceServer.register('eip155:84532', new ExactEvmScheme());

// Request logging middleware
app.use((req, res, next) => {
    console.log(`[Server] Incoming ${req.method} request to ${req.url}`);
    next();
});

// Create payment middleware instance
const payMiddleware = paymentMiddleware(
    {
        '/api/premium-data': {
            accepts: [
                {
                    scheme: 'exact',
                    price: '$0.001',
                    network: 'eip155:84532',
                    payTo: MERCHANT_ADDRESS
                }
            ],
            description: 'Protected premium data endpoint',
            mimeType: 'application/json'
        }
    },
    resourceServer
);

// Safe payment middleware wrapper to catch errors and return JSON
app.use((req, res, next) => {
    payMiddleware(req, res, (err) => {
        if (err) {
            console.error('[Payment Middleware Error]:', err);
            return res.status(500).json({
                success: false,
                error: err.message || 'Payment middleware error'
            });
        }
        next();
    });
});

// Protected endpoint handler
app.get('/api/premium-data', (req, res) => {
    res.json({
        success: true,
        message: "Payment successfully verified!",
        data: { 
            secret: "Welcome to the automated Web3 economy." 
        }
    });
});

// Global JSON error-handling middleware
app.use((err, req, res, next) => {
    console.error('[Global Error Handler]:', err);
    res.status(500).json({
        success: false,
        error: err.message
    });
});

app.listen(3000, () => {
    console.log('x402 Merchant Agent running on port 3000');
    console.log('Protected endpoint: http://localhost:3000/api/premium-data');
});
