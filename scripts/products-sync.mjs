import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const publicOutputPath = path.join(projectRoot, "public", "data", "products.snapshot.json");
const srcOutputPath = path.join(projectRoot, "src", "data", "products.snapshot.json");

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      "user-agent": "f2-products-sync/1.0",
    },
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} from ${url}`);
  }

  return response.json();
}

async function fetchDummyJsonSource() {
  const data = await fetchJson("https://dummyjson.com/products/category/sports-accessories?limit=100");
  const items = Array.isArray(data?.products) ? data.products : [];

  return items.map((item) => ({
    id: `dummyjson:${String(item.id)}`,
    source: "dummyjson",
    sourceProductId: String(item.id),
    title: item.title ?? "Unknown product",
    brand: item.brand ?? "Unknown",
    category: item.category ?? "sports-accessories",
    price: Number(item.price ?? 0),
    currency: "USD",
    availability: item.availabilityStatus ?? "unknown",
    imageUrl: item.thumbnail ?? "",
    productUrl: `https://dummyjson.com/products/${item.id}`,
    fetchedAt: new Date().toISOString(),
  }));
}

async function fetchEbaySource() {
  const appId = process.env.EBAY_APP_ID;
  if (!appId) {
    return {
      status: "skipped",
      products: [],
      error: "EBAY_APP_ID is not set",
    };
  }

  const endpoint = new URL("https://svcs.ebay.com/services/search/FindingService/v1");
  endpoint.searchParams.set("OPERATION-NAME", "findItemsByKeywords");
  endpoint.searchParams.set("SERVICE-VERSION", "1.13.0");
  endpoint.searchParams.set("SECURITY-APPNAME", appId);
  endpoint.searchParams.set("RESPONSE-DATA-FORMAT", "JSON");
  endpoint.searchParams.set("REST-PAYLOAD", "true");
  endpoint.searchParams.set("keywords", "athletic shoes");
  endpoint.searchParams.set("paginationInput.entriesPerPage", "50");

  const data = await fetchJson(endpoint.toString());
  const response = data?.findItemsByKeywordsResponse?.[0];
  const result = response?.searchResult?.[0]?.item;
  const items = Array.isArray(result) ? result : [];

  const products = items.map((item) => {
    const priceData = item?.sellingStatus?.[0]?.currentPrice?.[0] ?? {};
    return {
      id: `ebay:${String(item?.itemId?.[0] ?? "unknown")}`,
      source: "ebay",
      sourceProductId: String(item?.itemId?.[0] ?? "unknown"),
      title: item?.title?.[0] ?? "Unknown product",
      brand: item?.condition?.[0]?.conditionDisplayName?.[0] ?? "Unknown",
      category: "athletic-shoes",
      price: Number(priceData?.__value__ ?? 0),
      currency: priceData?.["@currencyId"] ?? "USD",
      availability: item?.listingInfo?.[0]?.listingType?.[0] ?? "unknown",
      imageUrl: item?.galleryURL?.[0] ?? "",
      productUrl: item?.viewItemURL?.[0] ?? "",
      fetchedAt: new Date().toISOString(),
    };
  });

  return {
    status: "ok",
    products,
  };
}

function dedupeProducts(products) {
  const seen = new Set();
  const unique = [];

  for (const product of products) {
    const key = `${product.source}:${product.sourceProductId}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    unique.push(product);
  }

  return unique;
}

async function main() {
  const startedAt = new Date().toISOString();

  const sourceResults = [];
  const collectedProducts = [];

  try {
    const dummyProducts = await fetchDummyJsonSource();
    sourceResults.push({ name: "dummyjson", status: "ok", count: dummyProducts.length });
    collectedProducts.push(...dummyProducts);
  } catch (error) {
    sourceResults.push({
      name: "dummyjson",
      status: "error",
      count: 0,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  try {
    const ebayResult = await fetchEbaySource();
    sourceResults.push({
      name: "ebay",
      status: ebayResult.status,
      count: ebayResult.products.length,
      ...(ebayResult.error ? { error: ebayResult.error } : {}),
    });
    collectedProducts.push(...ebayResult.products);
  } catch (error) {
    sourceResults.push({
      name: "ebay",
      status: "error",
      count: 0,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  const products = dedupeProducts(collectedProducts);
  const snapshot = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    startedAt,
    totalProducts: products.length,
    sources: sourceResults,
    products,
  };

  const serializedSnapshot = `${JSON.stringify(snapshot, null, 2)}\n`;
  await mkdir(path.dirname(publicOutputPath), { recursive: true });
  await mkdir(path.dirname(srcOutputPath), { recursive: true });
  await writeFile(publicOutputPath, serializedSnapshot, "utf8");
  await writeFile(srcOutputPath, serializedSnapshot, "utf8");

  console.log(`Wrote ${products.length} products to ${publicOutputPath} and ${srcOutputPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
