// Quick mainnet ENS check for an agent name. Usage: node scripts/test_resolve.mjs <name>
import { createPublicClient, http } from 'viem';
import { mainnet } from 'viem/chains';
import { normalize } from 'viem/ens';

const name = process.argv[2] || 'stackchan.captaincode.eth';
const c = createPublicClient({ chain: mainnet, transport: http('https://ethereum-rpc.publicnode.com') });
const norm = normalize(name);
const [addr, ctx, url, endpointWeb] = await Promise.all([
  c.getEnsAddress({ name: norm }).catch((e) => 'ERR ' + e.message.split('\n')[0]),
  c.getEnsText({ name: norm, key: 'agent-context' }).catch(() => null),
  c.getEnsText({ name: norm, key: 'url' }).catch(() => null),
  c.getEnsText({ name: norm, key: 'agent-endpoint[web]' }).catch(() => null),
]);
console.log('name         :', name);
console.log('addr         :', addr);
console.log('agent-context:', ctx);
console.log('url          :', url);
console.log('endpoint[web]:', endpointWeb);
