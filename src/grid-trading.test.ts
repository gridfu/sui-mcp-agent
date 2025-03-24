import { GridTradingStrategy } from './grid-trading.js';

describe('GridTradingStrategy', () => {
  const defaultConfig = {
    upperPrice: 100,
    lowerPrice: 50,
    gridCount: 5,
    totalInvestment: 1000,
    baseToken: 'BTC',
    quoteToken: 'USDT'
  };

  describe('constructor and configuration', () => {
    it('should create strategy with valid config', () => {
      const strategy = new GridTradingStrategy(defaultConfig);
      expect(strategy).toBeInstanceOf(GridTradingStrategy);
    });

    it('should calculate correct number of grid levels', () => {
      const strategy = new GridTradingStrategy(defaultConfig);
      const levels = strategy.getGridLevels();
      // Grid levels should be gridCount + 1 (including both upper and lower bounds)
      expect(levels.length).toBe(defaultConfig.gridCount + 1);
    });
  });

  describe('grid level calculations', () => {
    it('should calculate correct price levels', () => {
      const strategy = new GridTradingStrategy(defaultConfig);
      const levels = strategy.getGridLevels();

      // Check first and last levels match config bounds
      expect(levels[0].price).toBe(defaultConfig.lowerPrice);
      expect(levels[levels.length - 1].price).toBe(defaultConfig.upperPrice);

      // Check price step is consistent
      const expectedStep = (defaultConfig.upperPrice - defaultConfig.lowerPrice) / defaultConfig.gridCount;
      for (let i = 1; i < levels.length; i++) {
        const actualStep = levels[i].price - levels[i - 1].price;
        expect(actualStep).toBeCloseTo(expectedStep, 5);
      }
    });

    it('should calculate correct order sizes', () => {
      const strategy = new GridTradingStrategy(defaultConfig);
      const levels = strategy.getGridLevels();

      const expectedInvestmentPerGrid = defaultConfig.totalInvestment / defaultConfig.gridCount;

      levels.forEach(level => {
        const expectedOrderSize = expectedInvestmentPerGrid / level.price;
        expect(level.buyOrderSize).toBeCloseTo(expectedOrderSize, 5);
        expect(level.sellOrderSize).toBeCloseTo(expectedOrderSize, 5);
      });
    });
  });

  describe('edge cases', () => {
    it('should handle minimum grid count', () => {
      const config = { ...defaultConfig, gridCount: 1 };
      const strategy = new GridTradingStrategy(config);
      const levels = strategy.getGridLevels();
      expect(levels.length).toBe(2); // Should have upper and lower bound levels
    });

    it('should handle close upper and lower prices', () => {
      const config = { ...defaultConfig, upperPrice: 50.1, lowerPrice: 50 };
      const strategy = new GridTradingStrategy(config);
      const levels = strategy.getGridLevels();
      expect(levels[0].price).toBe(50);
      expect(levels[levels.length - 1].price).toBe(50.1);
    });

    it('should handle large numbers', () => {
      const config = {
        ...defaultConfig,
        upperPrice: 1000000,
        lowerPrice: 500000,
        totalInvestment: 1000000
      };
      const strategy = new GridTradingStrategy(config);
      const levels = strategy.getGridLevels();
      expect(levels.length).toBe(config.gridCount + 1);
    });
  });

  describe('unimplemented features', () => {
    it('should throw error for placeLimitOrders', async () => {
      const strategy = new GridTradingStrategy(defaultConfig);
      await expect(strategy.placeLimitOrders()).rejects.toThrow('DEX SDK integration not implemented yet');
    });

    it('should throw error for monitorAndUpdateOrders', async () => {
      const strategy = new GridTradingStrategy(defaultConfig);
      await expect(strategy.monitorAndUpdateOrders()).rejects.toThrow('Order monitoring not implemented yet');
    });

    it('should throw error for calculatePnL', () => {
      const strategy = new GridTradingStrategy(defaultConfig);
      expect(() => strategy.calculatePnL()).toThrow('PnL calculation not implemented yet');
    });
  });
});