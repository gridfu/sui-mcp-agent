import { z } from 'zod';

export interface GridTradingConfig {
  upperPrice: number;
  lowerPrice: number;
  gridCount: number;
  totalInvestment: number;
  baseToken: string;
  quoteToken: string;
}

export interface GridLevel {
  price: number;
  buyOrderSize: number;
  sellOrderSize: number;
}

export interface ExecutedOrder {
  type: 'buy' | 'sell';
  price: number;
  quantity: number;
  timestamp: Date;
  gridIndex: number;
}

export class GridTradingStrategy {
  private readonly config: GridTradingConfig;
  private readonly gridLevels: GridLevel[];
  private readonly gridSpacing: number;
  private lastPrice: number | null = null;
  private executedOrders: ExecutedOrder[] = [];

  constructor(config: GridTradingConfig) {
    this.validateConfig(config);
    this.config = config;
    this.gridSpacing = (config.upperPrice - config.lowerPrice) / config.gridCount;
    this.gridLevels = this.calculateGridLevels();
  }

  private validateConfig(config: GridTradingConfig) {
    if (config.upperPrice <= config.lowerPrice) {
      throw new Error('Upper price must be greater than lower price');
    }
    if (config.gridCount < 2) {
      throw new Error('Grid count must be at least 2');
    }
    if (config.totalInvestment <= 0) {
      throw new Error('Total investment must be greater than 0');
    }
  }

  private calculateGridLevels(): GridLevel[] {
    const levels: GridLevel[] = [];
    const investmentPerGrid = this.config.totalInvestment / this.config.gridCount;

    for (let i = 0; i <= this.config.gridCount; i++) {
      const price = this.config.lowerPrice + (i * this.gridSpacing);
      const buyOrderSize = investmentPerGrid / price;
      const sellOrderSize = i > 0 ? levels[i - 1].buyOrderSize : 0;

      levels.push({
        price,
        buyOrderSize,
        sellOrderSize
      });
    }

    return levels;
  }

  public getGridLevels(): GridLevel[] {
    return [...this.gridLevels];
  }

  public getCurrentGridIndex(currentPrice: number): number {
    if (currentPrice < this.config.lowerPrice || currentPrice > this.config.upperPrice) {
      throw new Error('Current price is outside the grid range');
    }

    return Math.floor((currentPrice - this.config.lowerPrice) / this.gridSpacing);
  }

  public getNextBuyPrice(currentPrice: number): number {
    const currentIndex = this.getCurrentGridIndex(currentPrice);
    return currentIndex > 0 ? this.gridLevels[currentIndex - 1].price : -1;
  }

  public getNextSellPrice(currentPrice: number): number {
    const currentIndex = this.getCurrentGridIndex(currentPrice);
    return currentIndex < this.gridLevels.length - 1 ? this.gridLevels[currentIndex + 1].price : -1;
  }

  public getOrderSizeAtPrice(price: number, orderType: 'buy' | 'sell'): number {
    const index = this.getCurrentGridIndex(price);
    const level = this.gridLevels[index];
    return orderType === 'buy' ? level.buyOrderSize : level.sellOrderSize;
  }

  public checkPriceMovement(currentPrice: number): void {
    const currentIndex = this.getCurrentGridIndex(currentPrice);

    if (this.lastPrice === null) {
      // Initial position setup - execute buy at the current level
      this.executeBuy(this.gridLevels[currentIndex].price);
    } else {
      const previousIndex = this.getCurrentGridIndex(this.lastPrice);

      if (currentIndex > previousIndex) {
        // Price moved up - execute sell at new level
        this.executeSell(this.gridLevels[currentIndex].price);
      } else if (currentIndex < previousIndex) {
        // Price moved down - execute buy at new level
        this.executeBuy(this.gridLevels[currentIndex].price);
      }
    }
    this.lastPrice = currentPrice;
  }

  public getCurrentProfitLoss(currentPrice: number): number {
    let totalBuyQty = 0;
    let totalBuyCost = 0;
    let totalSellQty = 0;
    let totalReceived = 0;

    for (const order of this.executedOrders) {
      if (order.type === 'buy') {
        totalBuyQty += order.quantity;
        totalBuyCost += order.price * order.quantity;
      } else {
        totalSellQty += order.quantity;
        totalReceived += order.price * order.quantity;
      }
    }

    const remainingQty = totalBuyQty - totalSellQty;
    const currentValue = remainingQty * currentPrice;
    const realizedPnL = totalReceived - totalBuyCost;
    const unrealizedPnL = currentValue - (remainingQty > 0 ? remainingQty * this.config.lowerPrice : 0);

    return realizedPnL + unrealizedPnL;
  }

  private executeBuy(price: number): void {
    const quantity = this.getOrderSizeAtPrice(price, 'buy');
    const gridIndex = this.getCurrentGridIndex(price);
    this.executedOrders.push({
      type: 'buy',
      price,
      quantity,
      timestamp: new Date(),
      gridIndex
    });
  }

  private executeSell(price: number): void {
    const quantity = this.getOrderSizeAtPrice(price, 'sell');
    const gridIndex = this.getCurrentGridIndex(price);
    this.executedOrders.push({
      type: 'sell',
      price,
      quantity,
      timestamp: new Date(),
      gridIndex
    });
  }

  public getTradeHistory(): ExecutedOrder[] {
    return [...this.executedOrders];
  }
}