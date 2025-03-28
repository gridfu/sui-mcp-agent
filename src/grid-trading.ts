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
  private baseTokenBalance: number = 0;
  private quoteTokenBalance: number = 0;

  private initializeBalances() {
    this.quoteTokenBalance = this.config.totalInvestment;
  }

  constructor(config: GridTradingConfig) {
    this.validateConfig(config);
    this.config = config;
    this.gridSpacing = (config.upperPrice - config.lowerPrice) / config.gridCount;
    this.gridLevels = this.calculateGridLevels();
    this.quoteTokenBalance = config.totalInvestment;
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
      return -1;
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
      // Only execute initial buy order if we're at the lowest grid level
      if (currentIndex === 0) {
        this.executeBuy(currentPrice);
      }
      this.lastPrice = currentPrice;
      return;
    }

    const previousIndex = this.getCurrentGridIndex(this.lastPrice);
    if (currentIndex < previousIndex) {
      // Execute buy order when price moves down to a new grid level
      this.executeBuy(currentPrice);
    } else if (currentIndex > previousIndex) {
      // Execute sell order when price moves up to a new grid level
      this.executeSell(currentPrice);
    }
    this.lastPrice = currentPrice;
  }

  public getCurrentProfitLoss(currentPrice: number): number {
    const buyStack: Array<{price: number, quantity: number}> = [];
    let realizedPnL = 0;
    let totalRemainingQty = 0;

    // Rebuild FIFO stack from executed orders
    for (const order of this.executedOrders) {
      if (order.type === 'buy') {
        buyStack.push({ price: order.price, quantity: order.quantity });
        totalRemainingQty += order.quantity;
      } else {
        let sellQtyRemaining = order.quantity;

        // Process sells against oldest buys first
        while (sellQtyRemaining > 0 && buyStack.length > 0) {
          const oldestBuy = buyStack[0];
          const usedQty = Math.min(sellQtyRemaining, oldestBuy.quantity);

          realizedPnL += (order.price - oldestBuy.price) * usedQty;
          oldestBuy.quantity -= usedQty;
          totalRemainingQty -= usedQty;
          sellQtyRemaining -= usedQty;

          if (oldestBuy.quantity === 0) {
            buyStack.shift();
          }
        }
      }
    }

    // Calculate unrealized PnL for remaining inventory
    const averageCost = totalRemainingQty > 0
      ? buyStack.reduce((sum, buy) => sum + buy.price * buy.quantity, 0) / totalRemainingQty
      : 0;

    const unrealizedPnL = totalRemainingQty * (currentPrice - averageCost);

    return realizedPnL + unrealizedPnL;
  }

  private executeBuy(price: number): boolean {
    const quantity = this.getOrderSizeAtPrice(price, 'buy');
    const cost = quantity * price;

    if (this.quoteTokenBalance < cost) {
      return false;
    }

    const gridIndex = this.getCurrentGridIndex(price);
    this.executedOrders.push({
      type: 'buy',
      price,
      quantity,
      timestamp: new Date(),
      gridIndex
    });

    this.quoteTokenBalance -= cost;
    this.baseTokenBalance += quantity;
    return true;
  }

  private executeSell(price: number): boolean {
    const quantity = this.getOrderSizeAtPrice(price, 'sell');

    if (this.baseTokenBalance < quantity) {
      return false;
    }

    const gridIndex = this.getCurrentGridIndex(price);
    this.executedOrders.push({
      type: 'sell',
      price,
      quantity,
      timestamp: new Date(),
      gridIndex
    });

    this.baseTokenBalance -= quantity;
    this.quoteTokenBalance += quantity * price;
    return true;
  }

  public getTradeHistory(): ExecutedOrder[] {
    return [...this.executedOrders];
  }
}