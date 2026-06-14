// Check a wallet's USDC balance on Base mainnet. Usage: node scripts/test_usdc.mjs [addr]
import { createPublicClient, http, formatUnits } from 'viem';
import { base } from 'viem/chains';

const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'; // USDC on Base mainnet
const addr = process.argv[2] || '0x43C1cea18f06401e3EA6932BDaFF38185E7eB953';
const RPCS = ['https://mainnet.base.org', 'https://base-rpc.publicnode.com', 'https://base.llamarpc.com'];
const abi = [{ name: 'balanceOf', type: 'function', stateMutability: 'view', inputs: [{ name: 'a', type: 'address' }], outputs: [{ type: 'uint256' }] }];

for (const url of RPCS) {
  try {
    const c = createPublicClient({ chain: base, transport: http(url) });
    const bal = await c.readContract({ address: USDC, abi, functionName: 'balanceOf', args: [addr] });
    console.log(`USDC (Base mainnet) for ${addr}: ${formatUnits(bal, 6)} USDC   [via ${url}]`);
    break;
  } catch (e) {
    console.log(`ERR ${url}: ${(e.message || '').split('\n')[0]}`);
  }
}
