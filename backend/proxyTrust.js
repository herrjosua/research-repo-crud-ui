// Which proxies Express believes X-Forwarded-For / X-Forwarded-Proto from.
// Production traffic is browser -> Cloudflare -> host proxy -> app, so both
// hops must be trusted for req.ip to be the visitor (the rate limiters key on
// it). Trusting by address instead of a hop count means a request that skips
// Cloudflare and hits the host directly can't choose its own req.ip with a
// forged X-Forwarded-For: its hop isn't a Cloudflare address, so Express stops
// there and uses the real peer.

// Cloudflare's published edge ranges, from https://www.cloudflare.com/ips-v4
// and https://www.cloudflare.com/ips-v6, fetched 2026-09-24. They change
// rarely; re-check them when revisiting deployment.
const CLOUDFLARE_IPS = [
    '173.245.48.0/20', '103.21.244.0/22', '103.22.200.0/22', '103.31.4.0/22',
    '141.101.64.0/18', '108.162.192.0/18', '190.93.240.0/20', '188.114.96.0/20',
    '197.234.240.0/22', '198.41.128.0/17', '162.158.0.0/15', '104.16.0.0/13',
    '104.24.0.0/14', '172.64.0.0/13', '131.0.72.0/22',
    '2400:cb00::/32', '2606:4700::/32', '2803:f800::/32', '2405:b500::/32',
    '2405:8100::/32', '2a06:98c0::/29', '2c0f:f248::/32',
];

// TRUST_PROXY: the host proxy's address(es), comma separated. Express also
// accepts the names loopback, linklocal and uniquelocal. Default: loopback.
function trustProxySetting(value) {
    const hostProxies = (value || 'loopback').split(',').map((s) => s.trim()).filter(Boolean);
    return [...hostProxies, ...CLOUDFLARE_IPS];
}

module.exports = { CLOUDFLARE_IPS, trustProxySetting };
