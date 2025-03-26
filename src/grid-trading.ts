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

export class GridTradingStrategy {
  private readonly config: GridTradingConfig;
  private readonly gridLevels: GridLevel[];
  private readonly gridSpacing: number;

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
      const sellOrderSize = buyOrderSize;

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
}