export enum OrderSide {
  BUY = 'BUY',
  SELL = 'SELL'
}

export interface Order {
  id: string;
  price: number;
  amount: number;
  side: OrderSide;
  total: number;
  isBot?: boolean;
}

export interface Trade {
  id: string;
  price: number;
  amount: number;
  side: OrderSide;
  timestamp: number;
  isBot?: boolean;
}

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface BotConfig {
  isRunning: boolean;
  spread: number; // percentage
  priceOffset: number; // percentage skew
  orderSize: number;
  refreshRate: number; // ms
  volatility: number; // 0-1
}

export interface MarketState {
  currentPrice: number;
  bids: Order[];
  asks: Order[];
  trades: Trade[];
  candles: Candle[];
  volume24h: number;
  priceChange24h: number;
}