// next/link in a plain-Node test process. A Link is an anchor; the routing
// behaviour it adds is irrelevant to what a shopper reads.
import { createElement } from "react";
export default function Link({ href, children, ...rest }) {
  return createElement("a", { href, ...rest }, children);
}
