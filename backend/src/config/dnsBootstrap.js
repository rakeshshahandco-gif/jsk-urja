/**
 * Prefer IPv4 when resolving MongoDB Atlas hostnames.
 * Fixes intermittent getaddrinfo ENOTFOUND on some Windows / hotspot networks with Node 17+.
 */
import dns from 'node:dns';

if (typeof dns.setDefaultResultOrder === 'function') {
  dns.setDefaultResultOrder('ipv4first');
}