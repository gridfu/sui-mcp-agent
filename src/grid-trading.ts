import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

// Grid Trading Configuration Schema
const GridTradingConfig = z.object({
  upperPrice: z.number().positive()
    .refine(val => val <= 1e9, 'Upper price must not exceed 1 billion'),
  lowerPrice: z.number().positive()
    .refine(val => val >= 1e-9, 'Lower price must be at least 0.000000001'),
  gridCount: z.number().int().positive()
    .min(2, 'Grid count must be at least 2')
    .max(100, 'Grid count must not exceed 100'),
  totalInvestment: z.number().positive()
    .min(1, 'Total investment must be at least 1')
    .max(1e9, 'Total investment must not exceed 1 billion'),
  baseToken: z.string()
    .min(1, 'Base token address cannot be empty')
    .regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid base token address format'),
  quoteToken: z.string()
    .min(1, 'Quote token address cannot be empty')
    .regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid quote token address format'),
}).refine(
  data => data.upperPrice > data.lowerPrice,
  'Upper price must be greater than lower price'
);

type GridTradingConfig = z.infer<typeof GridTradingConfig>;

interface GridLevel {
  price: number;
  buyOrderSize: number;
  sellOrderSize: number;
  buyOrder?: Order;
  sellOrder?: Order;
}

interface Order {
  price: number;
  size: number;
  side: 'buy' | 'sell';
  status: 'pending' | 'filled' | 'cancelled';
}

interface Position {
  baseAmount: number;  // Amount of base token (e.g., BTC)
  quoteAmount: number; // Amount of quote token (e.g., USDT)
}

class GridTradingStrategy {
  private config: GridTradingConfig;
  private gridLevels: GridLevel[] = [];
  private position: Position = {
    baseAmount: 0,
    quoteAmount: 0
  };
  private realizedPnL: number = 0;
  private currentPrice: number = 0;

  constructor(config: GridTradingConfig, initialPosition?: Position, currentPrice?: number) {
    this.config = config;
    this.calculateGridLevels();
    if (initialPosition) {
      this.position = initialPosition;
    }
    if (currentPrice) {
      this.currentPrice = currentPrice;
    }
  }

  private calculateGridLevels() {
    const { upperPrice, lowerPrice, gridCount, totalInvestment } = this.config;
    const priceStep = (upperPrice - lowerPrice) / gridCount;
    const investmentPerGrid = totalInvestment / gridCount;

    for (let i = 0; i <= gridCount; i++) {
      const price = lowerPrice + i * priceStep;
      const buyOrderSize = investmentPerGrid / price;
      const sellOrderSize = buyOrderSize;

      this.gridLevels.push({
        price,
        buyOrderSize,
        sellOrderSize,
      });
    }
  }

  public getGridLevels(): GridLevel[] {
    return this.gridLevels;
  }

  // Method to place limit orders at each grid level
  public async placeLimitOrders(currentPrice: number) {
    this.currentPrice = currentPrice;

    for (const level of this.gridLevels) {
      if (level.price < currentPrice && !level.buyOrder) {
        level.buyOrder = {
          price: level.price,
          size: level.buyOrderSize,
          side: 'buy',
          status: 'pending'
        };
      }
      if (level.price > currentPrice && !level.sellOrder) {
        level.sellOrder = {
          price: level.price,
          size: level.sellOrderSize,
          side: 'sell',
          status: 'pending'
        };
      }
    }
  }

  // Method to monitor and update orders
  public async monitorAndUpdateOrders(newPrice: number) {
    const oldPrice = this.currentPrice;
    this.currentPrice = newPrice;

    // Process orders in the correct sequence based on price movement
    const levels = newPrice > oldPrice ?
      [...this.gridLevels].reverse() : // Process sell orders first when price moves up
      this.gridLevels; // Process buy orders first when price moves down

    for (const level of levels) {
      // Check if buy orders are triggered when price moves down
      if (level.buyOrder?.status === 'pending' &&
          newPrice <= level.price && oldPrice > level.price) {
        const filledBuyOrder = level.buyOrder;
        level.buyOrder = undefined;

        const cost = filledBuyOrder.price * filledBuyOrder.size;
        this.position.quoteAmount -= cost;
        this.position.baseAmount += filledBuyOrder.size;

        // Place new sell order at the next grid level up
        const sellPrice = level.price + (this.config.upperPrice - this.config.lowerPrice) / this.config.gridCount;
        level.sellOrder = {
          price: sellPrice,
          size: filledBuyOrder.size,
          side: 'sell',
          status: 'pending'
        };
      }

      // Check if sell orders are triggered when price moves up
      if (level.sellOrder?.status === 'pending' &&
          newPrice >= level.price && oldPrice < level.price) {
        const filledSellOrder = level.sellOrder;
        level.sellOrder = undefined;

        const revenue = filledSellOrder.price * filledSellOrder.size;
        this.position.baseAmount -= filledSellOrder.size;
        this.position.quoteAmount += revenue;

        // Calculate realized PnL using the buy price from the filled buy order
        const buyPrice = level.buyOrder?.price || level.price;
        this.realizedPnL += (filledSellOrder.price - buyPrice) * filledSellOrder.size;

        // Place new buy order at the next grid level down
        const buyPrice = level.price - (this.config.upperPrice - this.config.lowerPrice) / this.config.gridCount;
        level.buyOrder = {
          price: buyPrice,
          size: filledSellOrder.size,
          side: 'buy',
          status: 'pending'
        };
      }
    }
  }

  // Method to calculate profit/loss
  public calculatePnL(): number {
    return this.realizedPnL;
  }

  // Get current position
  public getPosition(): Position {
    return { ...this.position };
  }

  // Get current price
  public getCurrentPrice(): number {
    return this.currentPrice;
  }
}

// Export the strategy for use in the MCP server
export { GridTradingStrategy, GridTradingConfig };