import { wrapFetchWithPayment, x402Client } from '@x402/fetch';
import { registerExactEvmScheme } from '@x402/evm/exact/client';
import { privateKeyToAccount } from 'viem/accounts';

async function runClient() {
    console.log('[Client] Initializing autonomous test buyer...');

    const PRIVATE_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
    const signer = privateKeyToAccount(PRIVATE_KEY);
    console.log(`[Client] Wallet address: ${signer.address}`);

    const client = new x402Client();
    registerExactEvmScheme(client, { signer });

    const x402Fetch = wrapFetchWithPayment(fetch, client);

    console.log('[Client] Sending request to protected endpoint...');
    
    try {
        const response = await x402Fetch('http://localhost:3000/api/premium-data');
        
        // Capture raw response text for inspection
        const responseText = await response.text();
        console.log(`[Client] Raw response status: ${response.status}`);
        console.log(`[Client] Raw response body: "${responseText}"`);

        if (responseText.trim().length > 0) {
            const data = JSON.parse(responseText);
            console.log('[Client] Success! Parsed data:', data);
        } else {
            console.log('[Client] Warning: Server returned an empty response body.');
        }
    } catch (error) {
        console.error('[Client] Request failed:', error.message);
    }
}

runClient();
