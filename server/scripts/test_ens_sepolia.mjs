// Verify viem can resolve ENS on Sepolia (needs the universal resolver on-chain).
import { createPublicClient, http } from 'viem';
import { sepolia } from 'viem/chains';
import { normalize } from 'viem/ens';

const RPCS = [
  'https://ethereum-sepolia-rpc.publicnode.com',
  'https://sepolia.drpc.org',
  'https://1rpc.io/sepolia',
];
const NAMES = process.argv.slice(2);
const names = NAMES.length ? NAMES : ['test.eth', 'ens.eth'];

console.log('viem sepolia chain has ensUniversalResolver:', !!sepolia.contracts?.ensUniversalResolver);

for (const url of RPCS) {
  for (const n of names) {
    try {
      const c = createPublicClient({ chain: sepolia, transport: http(url) });
      const a = await c.getEnsAddress({ name: normalize(n) });
      console.log(`OK   ${url}  ${n} -> ${a}`);
    } catch (e) {
      console.log(`ERR  ${url}  ${n} - ${(e.message || '').split('\n')[0]}`);
    }
  }
}
