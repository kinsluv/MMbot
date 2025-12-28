import { Candle, Order, OrderSide, Trade } from "../types";
import { generateId } from "./marketSimulator";

const BASE_URL = 'https://api.lbkex.com/v2';

// API Credentials Configuration
// Defaults are provided but can be overwritten via UI
let lbankConfig = {
  apiKey: '6a8e91c9-5e11-4162-bf8b-d493f4ba54f0',
  secretKey: '828B5B864AC30AD47B7AE4C5879B83E1'
};

export const setLBankConfig = (apiKey: string, secretKey: string) => {
  lbankConfig.apiKey = apiKey;
  lbankConfig.secretKey = secretKey;
};

export const getLBankConfig = () => {
  return { ...lbankConfig };
};

// Helper to fetch data via proxy with fallback strategy
const fetchLBank = async (endpoint: string): Promise<any> => {
  const targetUrl = `${BASE_URL}${endpoint}`;
  // Add timestamp to prevent caching
  const cacheBuster = targetUrl.includes('?') ? `&_t=${Date.now()}` : `?_t=${Date.now()}`;
  const urlWithCache = targetUrl + cacheBuster;

  // List of proxies to try in order
  const proxies = [
    // Primary: corsproxy.io (usually fast and reliable)
    (url: string) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
    // Backup: allorigins (good alternative)
    (url: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`
  ];

  for (const createProxyUrl of proxies) {
    try {
      const fullUrl = createProxyUrl(urlWithCache);
      const res = await fetch(fullUrl);
      if (!res.ok) {
         // Continue to next proxy if status is bad
         continue;
      }
      const data = await res.json();
      return data;
    } catch (e) {
      // console.warn(`Proxy attempt failed for ${endpoint}:`, e);
      // Continue to next proxy
    }
  }

  throw new Error(`Failed to fetch ${endpoint} from all proxies.`);
};

// Helper to format symbols (e.g., "BTC-USD" -> "btc_usdt")
export const formatSymbol = (symbol: string): string => {
  // LBank uses lowercase with underscore, e.g. "btc_usdt"
  let s = symbol.toLowerCase();
  if (s.includes('-')) s = s.replace('-', '_');
  if (s.includes('/')) s = s.replace('/', '_');
  // If user just typed "btcusdt", we assume it's correct or they might need the underscore.
  // LBank requires the underscore usually.
  return s;
};

interface LBankTickerResponse {
  result: string;
  data: Array<{
    symbol: string;
    ticker: {
      high: string;
      vol: string;
      low: string;
      latest: string;
      turnover: string;
      change: string;
    };
    timestamp: number;
  }>;
}

interface LBankDepthResponse {
  result: string;
  data: {
    asks: (string | number)[][]; // [price, volume] - API often returns strings
    bids: (string | number)[][];
  };
}

interface LBankKlineResponse {
  result: string;
  data: (string | number)[][]; // [time, open, high, low, close, volume]
}

interface LBankTradeResponse {
  result: string;
  data: Array<{
    date_ms: number;
    amount: string;
    price: string;
    type: string; // "buy" or "sell"
    tid: string;
  }>;
}

export const fetchProductTicker = async (symbol: string): Promise<number | null> => {
  try {
    const formatted = formatSymbol(symbol);
    const json: LBankTickerResponse = await fetchLBank(`/ticker/24hr.do?symbol=${formatted}`);
    
    // Check for LBank specific error response structure or empty data
    if (!json || json.result !== 'true' || !json.data || json.data.length === 0) {
        // If result is not true, it might be an invalid symbol or API error.
        return null; 
    }

    return parseFloat(json.data[0].ticker.latest);
  } catch (e) {
    console.error("LBank Ticker Error:", e);
    return null;
  }
};

export const fetchProductStats = async (symbol: string): Promise<{ volume24h: number, priceChange24h: number } | null> => {
  try {
    const formatted = formatSymbol(symbol);
    const json: LBankTickerResponse = await fetchLBank(`/ticker/24hr.do?symbol=${formatted}`);

    if (!json || json.result !== 'true' || !json.data || json.data.length === 0) return null;

    const t = json.data[0].ticker;
    return { 
      volume24h: parseFloat(t.vol), 
      priceChange24h: parseFloat(t.change) 
    };
  } catch (e) {
    console.error("LBank Stats Error:", e);
    return null;
  }
};

export const fetchOrderBook = async (symbol: string, currentPrice: number): Promise<{ bids: Order[], asks: Order[] }> => {
  try {
    const formatted = formatSymbol(symbol);
    // size=20 gives top 20
    const json: LBankDepthResponse = await fetchLBank(`/depth.do?symbol=${formatted}&size=20`);
    
    if (!json || json.result !== 'true' || !json.data) return { bids: [], asks: [] };

    // Helper to safely parse numbers
    const parseVal = (val: string | number) => typeof val === 'string' ? parseFloat(val) : val;

    // Map bids
    const bids: Order[] = json.data.bids.map((b) => {
      const price = parseVal(b[0]);
      const amount = parseVal(b[1]);
      return {
        id: generateId(),
        price,
        amount,
        side: OrderSide.BUY,
        total: price * amount,
        isBot: false
      };
    });

    // Map asks
    const asks: Order[] = json.data.asks.map((a) => {
      const price = parseVal(a[0]);
      const amount = parseVal(a[1]);
      return {
        id: generateId(),
        price,
        amount,
        side: OrderSide.SELL,
        total: price * amount,
        isBot: false
      };
    });

    return { bids, asks };
  } catch (e) {
    console.error("LBank Book Error:", e);
    return { bids: [], asks: [] };
  }
};

export const fetchCandles = async (symbol: string): Promise<Candle[]> => {
  try {
    const formatted = formatSymbol(symbol);
    // type=minute1, size=60 (last 60 candles)
    // LBank returns time in seconds
    const time = Math.floor(Date.now() / 1000);
    const json: LBankKlineResponse = await fetchLBank(`/kline.do?symbol=${formatted}&size=60&type=minute1&time=${time}`);

    if (!json || json.result !== 'true' || !json.data) return [];

    // Helper to safely parse numbers
    const parseVal = (val: string | number) => typeof val === 'string' ? parseFloat(val) : val;

    // LBank Data: [time, open, high, low, close, volume]
    // Filter out invalid data if any
    return json.data.map(c => ({
      time: (typeof c[0] === 'string' ? parseInt(c[0]) : c[0]) * 1000, // convert to ms
      open: parseVal(c[1]),
      high: parseVal(c[2]),
      low: parseVal(c[3]),
      close: parseVal(c[4]),
      volume: parseVal(c[5])
    }));
  } catch (e) {
    console.error("LBank Candle Error:", e);
    return [];
  }
};

export const fetchRecentTrades = async (symbol: string): Promise<Trade[]> => {
  try {
    const formatted = formatSymbol(symbol);
    // Fetch last 50 trades
    const json: LBankTradeResponse = await fetchLBank(`/trades.do?symbol=${formatted}&size=50`);

    if (!json || json.result !== 'true' || !json.data) return [];

    return json.data.map(t => ({
      id: t.tid,
      price: parseFloat(t.price),
      amount: parseFloat(t.amount),
      side: t.type === 'buy' ? OrderSide.BUY : OrderSide.SELL,
      timestamp: t.date_ms,
      isBot: false
    }));
  } catch (e) {
    console.error("LBank Trades Error:", e);
    return [];
  }
};