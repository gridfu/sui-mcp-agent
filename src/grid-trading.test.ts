import { GridTradingStrategy, GridTradingConfig } from './grid-trading';

describe('GridTradingStrategy', () => {
  let config: GridTradingConfig;

  beforeEach(() => {
    config = {
      upperPrice: 30000,  // $30,000
      lowerPrice: 20000,  // $20,000
      gridCount: 10,
      totalInvestment: 100000,  // $100,000
      baseToken: 'BTC',
      quoteToken: 'USDT'
    };
  });

  describe('constructor and validation', () => {
    it('should create grid levels correctly', () => {
      const strategy = new GridTradingStrategy(config);
      const levels = strategy.getGridLevels();

      expect(levels.length).toBe(11); // gridCount + 1 levels
      expect(levels[0].price).toBe(20000);
      expect(levels[levels.length - 1].price).toBe(30000);
    });

    it('should throw error for invalid price range', () => {
      const invalidConfig = { ...config, upperPrice: 19000 }; // Upper price less than lower price
      expect(() => new GridTradingStrategy(invalidConfig)).toThrow('Upper price must be greater than lower price');
    });

    it('should throw error for invalid grid count', () => {
      const invalidConfig = { ...config, gridCount: 1 };
      expect(() => new GridTradingStrategy(invalidConfig)).toThrow('Grid count must be at least 2');
    });

    it('should throw error for invalid investment amount', () => {
      const invalidConfig = { ...config, totalInvestment: 0 };
      expect(() => new GridTradingStrategy(invalidConfig)).toThrow('Total investment must be greater than 0');
    });
  });

  describe('grid calculations', () => {
    let strategy: GridTradingStrategy;

    beforeEach(() => {
      strategy = new GridTradingStrategy(config);
    });

    it('should calculate grid spacing correctly', () => {
      const levels = strategy.getGridLevels();
      const expectedSpacing = 1000; // (30000 - 20000) / 10

      for (let i = 1; i < levels.length; i++) {
        expect(levels[i].price - levels[i - 1].price).toBeCloseTo(expectedSpacing);
      }
    });

    it('should calculate order sizes correctly', () => {
      const levels = strategy.getGridLevels();
      const investmentPerGrid = config.totalInvestment / config.gridCount;

      levels.forEach(level => {
        const expectedSize = investmentPerGrid / level.price;
        expect(level.buyOrderSize).toBeCloseTo(expectedSize);
        expect(level.sellOrderSize).toBeCloseTo(expectedSize);
      });
    });
  });

  describe('price level management', () => {
    let strategy: GridTradingStrategy;

    beforeEach(() => {
      strategy = new GridTradingStrategy(config);
    });

    it('should get correct grid index for current price', () => {
      expect(strategy.getCurrentGridIndex(25000)).toBe(5); // Middle of the grid
      expect(strategy.getCurrentGridIndex(20000)).toBe(0); // Lower boundary
      expect(strategy.getCurrentGridIndex(30000)).toBe(10); // Upper boundary
    });

    it('should throw error for price outside grid range', () => {
      expect(() => strategy.getCurrentGridIndex(19999)).toThrow('Current price is outside the grid range');
      expect(() => strategy.getCurrentGridIndex(30001)).toThrow('Current price is outside the grid range');
    });

    it('should get correct next buy price', () => {
      expect(strategy.getNextBuyPrice(25000)).toBe(24000); // One level down
      expect(strategy.getNextBuyPrice(20000)).toBe(-1); // At bottom, no buy price
    });

    it('should get correct next sell price', () => {
      expect(strategy.getNextSellPrice(25000)).toBe(26000); // One level up
      expect(strategy.getNextSellPrice(30000)).toBe(-1); // At top, no sell price
    });

    it('should get correct order size at price', () => {
      const level = strategy.getGridLevels()[5]; // Middle level
      const price = level.price;

      expect(strategy.getOrderSizeAtPrice(price, 'buy')).toBe(level.buyOrderSize);
      expect(strategy.getOrderSizeAtPrice(price, 'sell')).toBe(level.sellOrderSize);
    });
  });

  describe('edge cases', () => {
    it('should handle minimum grid count', () => {
      const minConfig = { ...config, gridCount: 2 };
      const strategy = new GridTradingStrategy(minConfig);
      const levels = strategy.getGridLevels();

      expect(levels.length).toBe(3);
      expect(levels[0].price).toBe(20000);
      expect(levels[2].price).toBe(30000);
    });

    it('should handle small price range', () => {
      const smallRangeConfig = { ...config, upperPrice: 20100, lowerPrice: 20000, gridCount: 2 };
      const strategy = new GridTradingStrategy(smallRangeConfig);
      const levels = strategy.getGridLevels();

      expect(levels[1].price - levels[0].price).toBeCloseTo(50);
    });

    it('should handle large numbers', () => {
      const largeConfig = {
        ...config,
        upperPrice: 1000000,
        lowerPrice: 100000,
        totalInvestment: 10000000
      };
      const strategy = new GridTradingStrategy(largeConfig);
      const levels = strategy.getGridLevels();

      expect(levels.length).toBe(11);
      expect(levels[0].price).toBe(100000);
      expect(levels[10].price).toBe(1000000);
    });
  });
});