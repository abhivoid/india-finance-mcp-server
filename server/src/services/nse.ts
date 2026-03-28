import { NseIndia } from 'stock-nse-india';
import Redis from 'ioredis';
import { logger } from '../utils/logger.js';

const CACHE_TTL_SEC = 60;

let redis: Redis | null = null;
let nseClient: NseIndia | null = null;

export function initRedis(redisUrl: string): void {
  redis = new Redis(redisUrl, {
    maxRetriesPerRequest: 2,
    lazyConnect: true,
  });
  redis.on('error', (err) => {
    logger.error({ err }, 'Redis connection error');
  });
  void redis.connect().catch((err) => {
    logger.error({ err }, 'Redis initial connect failed');
  });
}

function getRedis(): Redis {
  if (!redis) {
    throw new Error('Redis not initialized; call initRedis from application bootstrap');
  }
  return redis;
}

function getNse(): NseIndia {
  if (!nseClient) {
    nseClient = new NseIndia();
  }
  return nseClient;
}

export type StockQuote = {
  symbol: string;
  ltp: number;
  change: number;
  pChange: number;
  volume: number | null;
  marketCap: number | null;
  week52High: number;
  week52Low: number;
  open: number;
  high: number;
  low: number;
  previousClose: number;
  source: string;
};

export async function getStockQuote(symbol: string): Promise<StockQuote> {
  const sym = symbol.toUpperCase().trim();
  const cacheKey = `quote:${sym}`;
  const client = getRedis();

  let stale: string | null = null;
  try {
    stale = await client.get(cacheKey);
    if (stale) {
      logger.debug({ cacheKey }, 'quote cache hit');
      return JSON.parse(stale) as StockQuote;
    }

    const nse = getNse();
    const [details, trade] = await Promise.all([
      nse.getEquityDetails(sym),
      nse.getEquityTradeInfo(sym),
    ]);

    const p = details.priceInfo;
    const vol = trade.marketDeptOrderBook?.tradeInfo?.totalTradedVolume ?? null;
    const mcap = trade.marketDeptOrderBook?.tradeInfo?.totalMarketCap ?? null;

    const quote: StockQuote = {
      symbol: details.metadata.symbol,
      ltp: p.lastPrice,
      change: p.change,
      pChange: p.pChange,
      volume: vol,
      marketCap: mcap,
      week52High: p.weekHighLow.max,
      week52Low: p.weekHighLow.min,
      open: p.open,
      high: p.intraDayHighLow.max,
      low: p.intraDayHighLow.min,
      previousClose: p.previousClose,
      source: 'NSE India',
    };

    await client.setex(cacheKey, CACHE_TTL_SEC, JSON.stringify(quote));
    return quote;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err, symbol: sym }, 'NSE quote fetch failed');

    if (stale) {
      logger.warn({ symbol: sym }, 'returning stale cached quote after upstream failure');
      return JSON.parse(stale) as StockQuote;
    }

    throw new Error(`Failed to fetch quote for ${sym}: ${message}`);
  }
}
