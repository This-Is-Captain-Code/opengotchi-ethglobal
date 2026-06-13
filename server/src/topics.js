// Topic helpers — the og/d/<HASH>/... scheme from MQTT_PROTOCOL_GUIDE.txt §3.

export const base = (hash) => `og/d/${hash}`;

// Device -> broker (server SUBSCRIBES to these)
export const t = {
  status: (h) => `${base(h)}/status`,
  telemetry: (h) => `${base(h)}/telemetry`,
  commands: (h) => `${base(h)}/commands`,
  cmdAck: (h) => `${base(h)}/cmd/ack`,
  // broker -> device (server PUBLISHES to these)
  cmd: (h) => `${base(h)}/cmd`,
  action: (h) => `${base(h)}/action`,
};

// Topics the server subscribes to for a given device hash.
export const serverSubs = (h) => [t.status(h), t.telemetry(h), t.commands(h), t.cmdAck(h)];

/** Parse an incoming topic into { hash, leaf } or null. */
export function parse(topic) {
  const m = topic.match(/^og\/d\/([0-9a-f]{32})\/(.+)$/);
  if (!m) return null;
  return { hash: m[1], leaf: m[2] };
}
