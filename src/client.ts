import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';
import { SiweMessage } from 'siwe';

const BASE_URL = 'http://localhost:3000';

async function runClientTest() {
  console.log('[Client] Starting Multi-Chain x402 Agent Test...\n');

  try {
    console.log('[1/5] Checking multi-chain server health...');
    const healthRes = await fetch(`${BASE_URL}/health`);
    const healthData = await healthRes.json();
    console.log('Health Response:', healthData);

    console.log('\n[2/5] Requesting SIWE nonce...');
    const nonceRes = await fetch(`${BASE_URL}/auth/nonce`);
    const nonceData = await nonceRes.json();

    console.log('\n[3/5] Initializing local EVM wallet...');
    const privateKey = generatePrivateKey();
    const account = privateKeyToAccount(privateKey);
    console.log(`Generated EVM Address: ${account.address}`);

    const siweMessage = new SiweMessage({
      domain: 'localhost:3000',
      address: account.address,
      statement: 'Aegis multi-chain agent data access verification.',
      uri: 'http://localhost:3000',
      version: '1',
      chainId: 84532,
      nonce: nonceData.nonce,
      issuedAt: new Date().toISOString()
    });

    const messageToSign = siweMessage.prepareMessage();
    const signature = await account.signMessage({ message: messageToSign });

    console.log('\n[4/5] Authenticating SIWE Session...');
    const verifyRes = await fetch(`${BASE_URL}/auth/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: messageToSign, signature })
    });

    const verifyData = await verifyRes.json();
    console.log('Session Authenticated! Token:', verifyData.token);

    console.log('\n[5/5] Accessing Premium Resource (Checking Multi-Chain Challenge)...');
    const resourceRes = await fetch(`${BASE_URL}/resource/premium-data`, {
      headers: { 'Authorization': `Bearer ${verifyData.token}` }
    });

    if (resourceRes.status === 402) {
      const challenge = await resourceRes.json();
      console.log('x402 Multi-Chain Options Received:', challenge.options);

      console.log('\nSettling payment on EVM...');
      const paidResEVM = await fetch(`${BASE_URL}/resource/premium-data`, {
        headers: {
          'Authorization': `Bearer ${verifyData.token}`,
          'payment-signature': `0x_mock_evm_tx_${Date.now()}`,
          'x-payment-chain': 'evm'
        }
      });
      console.log('EVM Resource Response:', await paidResEVM.json());

      console.log('\nSettling payment on Solana...');
      const paidResSolana = await fetch(`${BASE_URL}/resource/premium-data`, {
        headers: {
          'Authorization': `Bearer ${verifyData.token}`,
          'payment-signature': `sol_mock_tx_${Date.now()}`,
          'x-payment-chain': 'solana'
        }
      });
      console.log('Solana Resource Response:', await paidResSolana.json());
    }
  } catch (error) {
    console.error('[Client] Test failed:', error);
  }
}

runClientTest();
