import WynnShop from "./WynnShop";
import { ldJson, shopItemListSchema } from "./seo";

export default function Home() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldJson(shopItemListSchema()) }} />
      <WynnShop />
    </>
  );
}
