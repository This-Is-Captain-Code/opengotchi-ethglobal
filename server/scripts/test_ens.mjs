// Probe several public mainnet RPCs for ENS resolution; print which work.
import { createPublicClient, http } from 'viem';
import { mainnet } from 'viem/chains';
import { normalize } from 'viem/ens';

const rpcs = [
  'https://ethereum-rpc.publicnode.com',
  'https://cloudflare-eth.com',
  'https://rpc.ankr.com/eth',
  'https://eth.drpc.org',
  'https://eth.llamarpc.com',
  'https://1rpc.io/eth',
];

for (const url of rpcs) {
  try {
    const c = createPublicClient({ chain: mainnet, transport: http(url) });
    const a = await c.getEnsAddress({ name: normalize('vitalik.eth') });
    console.log('OK  ', url, '->', a);
  } catch (e) {
    console.log('ERR ', url, '-', (e.message || '').split('\n')[0]);
  }
}
