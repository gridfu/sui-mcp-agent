import { GridTradingStrategy, GridTradingConfig } from './grid-trading.js';
import { z } from 'zod';

describe('GridTradingStrategy', () => {
  const defaultConfig = {
    upperPrice: 100,
    lowerPrice: 50,
    gridCount: 5,
    totalInvestment: 1000,
    baseToken: '0x1234567890123456789012345678901234567890',
    quoteToken: '0x0987654321098765432109876543210987654321'
  };

  describe('GridTradingConfig validation', () => {
    it('should accept valid configuration', () => {
      expect(() => GridTradingConfig.parse(defaultConfig)).not.toThrow();
    });

    describe('price validations', () => {
      it('should reject negative upper price', () => {
        const invalidConfig = { ...defaultConfig, upperPrice: -100 };
        expect(() => GridTradingConfig.parse(invalidConfig)).toThrow();
      });

      it('should reject upper price exceeding 1 billion', () => {
        const invalidConfig = { ...defaultConfig, upperPrice: 2e9 };
        expect(() => GridTradingConfig.parse(invalidConfig))
          .toThrow('Upper price must not exceed 1 billion');
      });

      it('should reject negative lower price', () => {
        const invalidConfig = { ...defaultConfig, lowerPrice: -50 };
        expect(() => GridTradingConfig.parse(invalidConfig)).toThrow();
      });

      it('should reject lower price below minimum', () => {
        const invalidConfig = { ...defaultConfig, lowerPrice: 1e-10 };
        expect(() => GridTradingConfig.parse(invalidConfig))
          .toThrow('Lower price must be at least 0.000000001');
      });

      it('should reject when upper price is not greater than lower price', () => {
        const invalidConfig = { ...defaultConfig, upperPrice: 50, lowerPrice: 50 };
        expect(() => GridTradingConfig.parse(invalidConfig))
          .toThrow('Upper price must be greater than lower price');
      });
    });

    describe('grid count validations', () => {
      it('should reject non-integer grid count', () => {
        const invalidConfig = { ...defaultConfig, gridCount: 3.5 };
        expect(() => GridTradingConfig.parse(invalidConfig)).toThrow();
      });

      it('should reject grid count less than 2', () => {
        const invalidConfig = { ...defaultConfig, gridCount: 1 };
        expect(() => GridTradingConfig.parse(invalidConfig))
          .toThrow('Grid count must be at least 2');
      });

      it('should reject grid count exceeding 100', () => {
        const invalidConfig = { ...defaultConfig, gridCount: 101 };
        expect(() => GridTradingConfig.parse(invalidConfig))
          .toThrow('Grid count must not exceed 100');
      });
    });

    describe('investment validations', () => {
      it('should reject negative total investment', () => {
        const invalidConfig = { ...defaultConfig, totalInvestment: -1000 };
        expect(() => GridTradingConfig.parse(invalidConfig)).toThrow();
      });

      it('should reject total investment less than 1', () => {
        const invalidConfig = { ...defaultConfig, totalInvestment: 0.5 };
        expect(() => GridTradingConfig.parse(invalidConfig))
          .toThrow('Total investment must be at least 1');
      });

      it('should reject total investment exceeding 1 billion', () => {
        const invalidConfig = { ...defaultConfig, totalInvestment: 2e9 };
        expect(() => GridTradingConfig.parse(invalidConfig))
          .toThrow('Total investment must not exceed 1 billion');
      });
    });

    describe('token address validations', () => {
      it('should reject empty base token address', () => {
        const invalidConfig = { ...defaultConfig, baseToken: '' };
        expect(() => GridTradingConfig.parse(invalidConfig))
          .toThrow('Base token address cannot be empty');
      });

      it('should reject invalid base token address format', () => {
        const invalidConfig = { ...defaultConfig, baseToken: 'invalid-address' };
        expect(() => GridTradingConfig.parse(invalidConfig))
          .toThrow('Invalid base token address format');
      });

      it('should reject empty quote token address', () => {
        const invalidConfig = { ...defaultConfig, quoteToken: '' };
        expect(() => GridTradingConfig.parse(invalidConfig))
          .toThrow('Quote token address cannot be empty');
      });

      it('should reject invalid quote token address format', () => {
        const invalidConfig = { ...defaultConfig, quoteToken: 'invalid-address' };
        expect(() => GridTradingConfig.parse(invalidConfig))
          .toThrow('Invalid quote token address format');
      });
    });
  });

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

  // describe('grid level calculations', () => {
  //   it('should calculate correct price levels', () => {
  //     const strategy = new GridTradingStrategy(defaultConfig);
  //     const levels = strategy.getGridLevels();

  //     // Check first and last levels match config bounds
  //     expect(levels[0].price).toBe(defaultConfig.lowerPrice);
  //     expect(levels[levels.length - 1].price).toBe(defaultConfig.upperPrice);

  //     // Check price step is consistent
  //     const expectedStep = (defaultConfig.upperPrice - defaultConfig.lowerPrice) / defaultConfig.gridCount;
  //     for (let i = 1; i < levels.length; i++) {
  //       const actualStep = levels[i].price - levels[i - 1].price;
  //       expect(actualStep).toBeCloseTo(expectedStep, 5);
  //     }
  //   });

  //   it('should calculate consistent base asset amount per grid', () => {
  //     const strategy = new GridTradingStrategy(defaultConfig);
  //     const levels = strategy.getGridLevels();

  //     const avgPrice = (defaultConfig.upperPrice + defaultConfig.lowerPrice) / 2;
  //     const totalBaseAsset = defaultConfig.totalInvestment / avgPrice;
  //     const expectedBaseAssetPerGrid = totalBaseAsset / defaultConfig.gridCount;

  //     levels.forEach(level => {
  //       expect(level.buyOrderSize).toBeCloseTo(expectedBaseAssetPerGrid, 5);
  //       expect(level.sellOrderSize).toBeCloseTo(expectedBaseAssetPerGrid, 5);
  //     });
  //   });
  // });

  // describe('edge cases', () => {
  //   it('should handle minimum grid count', () => {
  //     const config = { ...defaultConfig, gridCount: 1 };
  //     const strategy = new GridTradingStrategy(config);
  //     const levels = strategy.getGridLevels();
  //     expect(levels.length).toBe(2); // Should have upper and lower bound levels
  //   });

  //   it('should handle close upper and lower prices', () => {
  //     const config = { ...defaultConfig, upperPrice: 50.1, lowerPrice: 50 };
  //     const strategy = new GridTradingStrategy(config);
  //     const levels = strategy.getGridLevels();
  //     expect(levels[0].price).toBe(50);
  //     expect(levels[levels.length - 1].price).toBe(50.1);
  //   });

  //   it('should handle large numbers', () => {
  //     const config = {
  //       ...defaultConfig,
  //       upperPrice: 1000000,
  //       lowerPrice: 500000,
  //       totalInvestment: 1000000
  //     };
  //     const strategy = new GridTradingStrategy(config);
  //     const levels = strategy.getGridLevels();
  //     expect(levels.length).toBe(config.gridCount + 1);
  //   });
  // });

  describe('BTC/USDT grid trading scenario', () => {
    const btcConfig = {
      upperPrice: 52000,
      lowerPrice: 48000,
      gridCount: 4,
      totalInvestment: 2000,
      baseToken: '0x1234567890123456789012345678901234567890',
      quoteToken: '0x0987654321098765432109876543210987654321'
    };

    const initialPosition = {
      baseAmount: 0,  // Initial BTC
      quoteAmount: 2000  // Initial USDT
    };

    it('should set up initial grid levels correctly', () => {
      const strategy = new GridTradingStrategy(btcConfig, initialPosition, 50000);
      const levels = strategy.getGridLevels();

      expect(levels.length).toBe(5); // 4 grids = 5 price levels
      expect(levels[0].price).toBe(48000);
      expect(levels[4].price).toBe(52000);

      // Verify grid spacing
      const expectedStep = 1000; // (52000 - 48000) / 4
      for (let i = 1; i < levels.length; i++) {
        expect(levels[i].price - levels[i-1].price).toBe(expectedStep);
      }
    });

    it('should place initial orders correctly at 50000 USDT', async () => {
      const strategy = new GridTradingStrategy(btcConfig, initialPosition, 50000);
      await strategy.placeLimitOrders(50000);
      const levels = strategy.getGridLevels();

      expect(levels.length).toBe(5); // 4 grids = 4 orders

      // Verify buy orders below current price
      expect(levels[0].buyOrder).toBeDefined();
      expect(levels[0].buyOrder?.price).toBe(48000);
      expect(levels[0].price).toBe(48000);

      expect(levels[1].buyOrder).toBeDefined();
      expect(levels[1].buyOrder?.price).toBe(49000);
      expect(levels[1].price).toBe(49000);

      expect(levels[2].buyOrder).toBeDefined();
      expect(levels[2].buyOrder?.price).toBe(50000);
      expect(levels[2].price).toBe(50000);

      // no sell orders above current price
      expect(levels[3].price).toBe(51000);
      expect(levels[3].buyOrder).toBeUndefined();
      expect(levels[3].sellOrder).toBeUndefined();

      expect(levels[4].price).toBe(52000);
      expect(levels[4].buyOrder).toBeUndefined();
      expect(levels[4].sellOrder).toBeUndefined();
    });

    it('should handle price drop to 49000 USDT correctly', async () => {
      const strategy = new GridTradingStrategy(btcConfig, initialPosition, 50000);
      await strategy.placeLimitOrders(50000);
      const position_init = strategy.getPosition();
      expect(position_init.quoteAmount).toEqual(2000);
      expect(position_init.baseAmount).toEqual(0);

      // check buy/sell orders at all levels
      const levels = strategy.getGridLevels();

      // Verify buy orders below current price
      // Check buy orders below current price
      expect(levels[0].buyOrder?.status).toBe('pending');
      expect(levels[0].buyOrder?.price).toBe(48000);
      expect(levels[0].sellOrder).toBeUndefined();

      // Current price level: filled buy order at 49000, placed sell order at 50000
      expect(levels[1].buyOrder?.status).toBe('pending');
      expect(levels[1].buyOrder?.price).toBe(49000);
      expect(levels[1].sellOrder).toBeUndefined();

      // Verify sell orders above current price
      expect(levels[2].buyOrder?.status).toBe('pending');
      expect(levels[2].buyOrder?.price).toBe(50000);
      expect(levels[2].sellOrder).toBeUndefined();

      // no sell orders above current price
      expect(levels[3].price).toBe(51000);
      expect(levels[3].buyOrder).toBeUndefined();
      expect(levels[3].sellOrder).toBeUndefined();

      expect(levels[4].price).toBe(52000);
      expect(levels[4].buyOrder).toBeUndefined();
      expect(levels[4].sellOrder).toBeUndefined();

      // Simulate price drop to 49000 USDT
      await strategy.monitorAndUpdateOrders(49000);
      // Check buy orders below current price
      expect(levels[0].buyOrder?.status).toBe('pending');
      expect(levels[0].buyOrder?.price).toBe(48000);
      expect(levels[0].sellOrder).toBeUndefined();
      // Current price level: filled buy order at 49000, placed sell order at 50000
      expect(levels[1].buyOrder).toBeUndefined();
      expect(levels[1].sellOrder?.status).toBe('pending');
      expect(levels[1].sellOrder?.price).toBe(50000);
      // Verify sell orders above current price
      expect(levels[2].buyOrder?.status).toBe('pending');
      expect(levels[2].buyOrder?.price).toBe(50000);
      expect(levels[2].sellOrder).toBeUndefined();
      // no sell orders above current price
      expect(levels[3].price).toBe(51000);
      expect(levels[3].buyOrder).toBeUndefined();
      expect(levels[3].sellOrder).toBeUndefined();

      expect(levels[4].price).toBe(52000);
      expect(levels[4].buyOrder).toBeUndefined();
      expect(levels[4].sellOrder).toBeUndefined();

      const position = strategy.getPosition();
      expect(position.baseAmount).toEqual(0.01);
      expect(position.quoteAmount).toEqual(1510);
    });

    it('should handle price recovery to 50000 USDT correctly', async () => {
      const strategy = new GridTradingStrategy(btcConfig, {
        baseAmount: 0.02,
        quoteAmount: 1510
      }, 49000);

      await strategy.placeLimitOrders(49000);
      await strategy.monitorAndUpdateOrders(50000);

      const position = strategy.getPosition();
      expect(position.baseAmount).toEqual(0.01); // 0.02 - 0.01 sold
      expect(position.quoteAmount).toEqual(2010); // 1510 + 500
      expect(strategy.calculatePnL()).toEqual(10); // Profit from 49000 -> 50000
    });

    it('should handle complete trading cycle with multiple price movements', async () => {
      const strategy = new GridTradingStrategy(btcConfig, initialPosition, 50000);
      await strategy.placeLimitOrders(50000);

      let levels = strategy.getGridLevels();
      expect(levels[1].buyOrder?.status).toBe('pending');
      expect(levels[1].buyOrder?.price).toBe(49000);
      expect(levels[1].sellOrder).toBeUndefined();

      // Price drops to 49000
      await strategy.monitorAndUpdateOrders(49000);
      // all levels detailed info:
      // 48000: buy: pending, sell: undefined
      // 49000: buy: undefined, sell: pending
      // 50000: buy: pending, sell: undefined
      // 51000: buy: undefined, sell: pending
      // 52000: buy: undefined, sell: pending
      levels = strategy.getGridLevels();
      // check buy/sell orders at levels 1(49000): filled buy order at 49000, place sell order at 50000
      expect(levels[1].buyOrder).toBeUndefined();
      expect(levels[1].sellOrder?.status).toBe('pending');
      expect(levels[1].sellOrder?.price).toBe(50000);
      // check quoteAmount and baseAmount
      expect(strategy.getPosition().quoteAmount).toEqual(1510);
      expect(strategy.getPosition().baseAmount).toEqual(0.01);

      // Price recovers to 50000
      await strategy.monitorAndUpdateOrders(50000);
      // all levels detailed info:
      // 48000: buy: pending, sell: undefined
      // 49000: buy: undefined, sell: pending
      // 50000: buy: pending, sell: undefined
      // 51000: buy: undefined, sell: pending
      // 52000: buy: undefined, sell: pending
      levels = strategy.getGridLevels();
      // check buy/sell orders at levels 1(49000): filled sell order at 50000, place buy order at 49000
      expect(levels[1].price).toBe(49000);
      expect(levels[1].buyOrder?.status).toBe('pending');
      expect(levels[1].buyOrder?.price).toBe(49000);
      expect(levels[1].sellOrder).toBeUndefined();
      // check buy/sell orders at levels 2(50000): filled buy order at 50000, place sell order at 51000
      expect(levels[2].buyOrder).toBeUndefined();
      expect(levels[2].sellOrder?.status).toBe('pending');
      expect(levels[2].sellOrder?.price).toBe(51000);
      // check quoteAmount and baseAmount
      expect(strategy.getPosition().quoteAmount).toEqual(1510);
      expect(strategy.getPosition().baseAmount).toEqual(0.01);

      // Price rises to 51000
      await strategy.monitorAndUpdateOrders(51000);
      levels = strategy.getGridLevels();
      // check buy/sell orders at levels 2(50000): filled sell order at 51000, place buy order at 50000
      expect(levels[2].buyOrder?.status).toBe('pending');
      expect(levels[2].buyOrder?.price).toBe(50000);
      expect(levels[2].sellOrder).toBeUndefined();
      // check buy/sell orders at levels 3(51000): filled buy order at 51000, place sell order at 52000
      expect(levels[3].buyOrder).toBeUndefined();
      expect(levels[3].sellOrder?.status).toBe('pending');
      expect(levels[3].sellOrder?.price).toBe(52000);
      // check quoteAmount and baseAmount
      expect(strategy.getPosition().quoteAmount).toEqual(1520);
      expect(strategy.getPosition().baseAmount).toEqual(0.01);

      // Price drops to 50000
      await strategy.monitorAndUpdateOrders(50000);
      levels = strategy.getGridLevels();
      // check buy/sell orders at levels 1(49000): since buy order is pending, no change
      expect(levels[1].buyOrder?.status).toBe('pending');
      expect(levels[1].buyOrder?.price).toBe(49000);
      expect(levels[1].sellOrder).toBeUndefined();
      // check buy/sell orders at levels 2(50000): filled buy order at 50000, place sell order at 51000
      expect(levels[2].buyOrder).toBeUndefined();
      expect(levels[2].sellOrder?.status).toBe('pending');
      expect(levels[2].sellOrder?.price).toBe(51000);
      // check quoteAmount and baseAmount
      expect(strategy.getPosition().quoteAmount).toEqual(1020);
      expect(strategy.getPosition().baseAmount).toEqual(0.02);

      // Price rises back to 51000
      await strategy.monitorAndUpdateOrders(51000);
      levels = strategy.getGridLevels();
      // check buy/sell orders at levels 2(50000)
      expect(levels[2].buyOrder?.status).toBe('pending');
      expect(levels[2].buyOrder?.price).toBe(50000);
      expect(levels[2].sellOrder).toBeUndefined();
      // check buy/sell orders at levels 3(51000)
      expect(levels[3].buyOrder).toBeUndefined();
      expect(levels[3].sellOrder?.status).toBe('pending');
      expect(levels[3].sellOrder?.price).toBe(52000);
      // check quoteAmount and baseAmount
      expect(strategy.getPosition().quoteAmount).toEqual(1530);
      expect(strategy.getPosition().baseAmount).toEqual(0.01);

      const position = strategy.getPosition();
      console.log("position: ", position)
      console.log("pnl: ", strategy.calculatePnL())
      expect(position.quoteAmount).toEqual(2530);
      expect(position.baseAmount).toEqual(0);
      expect(strategy.calculatePnL()).toEqual(30); // Total profit from all trades
    });
  });
});