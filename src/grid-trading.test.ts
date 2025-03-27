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

      levels.forEach((level, i) => {
        const expectedBuySize = investmentPerGrid / level.price;
        const expectedSellSize = i > 0 ? investmentPerGrid / levels[i - 1].price : 0;
        expect(level.buyOrderSize).toBeCloseTo(expectedBuySize);
        expect(level.sellOrderSize).toBeCloseTo(expectedSellSize);
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

  describe('execution triggers and PnL', () => {
    let strategy: GridTradingStrategy;

    beforeEach(() => {
      strategy = new GridTradingStrategy(config);
    });

    it('should execute orders when crossing grid levels', () => {
      const prices = [20000, 21000, 22000, 23000, 22000, 21000];
      prices.forEach(price => strategy.checkPriceMovement(price));

      const history = strategy.getTradeHistory();

      expect(history.length).toBe(6);
      expect(history.filter(o => o.type === 'sell').length).toBe(3);
      expect(history.filter(o => o.type === 'buy').length).toBe(3);

      // Check first buy order
      expect(history[0].type).toBe('buy');
      expect(history[0].price).toBe(20000);
      expect(history[0].quantity).toBeCloseTo(0.5);
      expect(history[0].timestamp).toBeInstanceOf(Date);
      expect(history[0].gridIndex).toBe(0);

      // Check first sell order
      expect(history[1].type).toBe('sell');
      expect(history[1].price).toBe(21000);
      expect(history[1].quantity).toBeCloseTo(0.5);
      expect(history[1].timestamp).toBeInstanceOf(Date);
      expect(history[1].gridIndex).toBe(1);

      // Check second sell order
      expect(history[2].type).toBe('sell');
      expect(history[2].price).toBe(22000);
      expect(history[2].quantity).toBeCloseTo(0.47619047619047616);
      expect(history[2].timestamp).toBeInstanceOf(Date);
      expect(history[2].gridIndex).toBe(2);

      // Check third sell order
      expect(history[3].type).toBe('sell');
      expect(history[3].price).toBe(23000);
      expect(history[3].quantity).toBeCloseTo(0.45454545454545453);
      expect(history[3].timestamp).toBeInstanceOf(Date);
      expect(history[3].gridIndex).toBe(3);

      // Check second buy order
      expect(history[4].type).toBe('buy');
      expect(history[4].price).toBe(22000);
      expect(history[4].quantity).toBeCloseTo(0.45454545454545453);
      expect(history[4].timestamp).toBeInstanceOf(Date);
      expect(history[4].gridIndex).toBe(2);

      // Check third buy order
      expect(history[5].type).toBe('buy');
      expect(history[5].price).toBe(21000);
      expect(history[5].quantity).toBeCloseTo(0.47619047619047616);
      expect(history[5].timestamp).toBeInstanceOf(Date);
      expect(history[5].gridIndex).toBe(1);
    });

    describe('PnL calculation details', () => {
      beforeEach(() => {
        strategy = new GridTradingStrategy(config);
      });

      it('should subtract initial investment from total value', () => {
        strategy.checkPriceMovement(20000);
        strategy.checkPriceMovement(21000);

        const pnl = strategy.getCurrentProfitLoss(21000);
        const expectedPnL = (100000/10/20000 * 21000) - 100000;
        expect(pnl).toBeCloseTo(expectedPnL);
      });

      it('should calculate inventory value at current price', () => {
        strategy.checkPriceMovement(20000);
        strategy.checkPriceMovement(21000);
        strategy.checkPriceMovement(22000);

        const pnl = strategy.getCurrentProfitLoss(25000);
        const inventoryValue = (100000/10/20000 - 100000/10/21000) * 25000;
        const expectedPnL = inventoryValue - (100000/10 * 2) + (100000/10/21000 * 22000);
        expect(pnl).toBeCloseTo(expectedPnL);
      });

      it('should track accumulated realized profits', () => {
        strategy.checkPriceMovement(20000);
        strategy.checkPriceMovement(21000);
        strategy.checkPriceMovement(22000);
        strategy.checkPriceMovement(21000);

        const pnl = strategy.getCurrentProfitLoss(20000);
        const realizedProfit = (100000/10/20000 * 21000) - (100000/10/21000 * 22000);
        expect(pnl).toBeCloseTo(realizedProfit - 100000);
      });

      it('should handle partial sells with remaining inventory', () => {
        // Initial buy
        strategy.checkPriceMovement(20000);

        // Partial sell at higher level
        strategy.checkPriceMovement(21000);
        strategy.checkPriceMovement(20000);

        const pnl = strategy.getCurrentProfitLoss(20000);
        const remainingQty = 100000/10/20000 - 100000/10/21000;
        const expectedPnL = (remainingQty * 20000) - (100000/10) + (100000/10/21000 * 21000);
        expect(pnl).toBeCloseTo(expectedPnL);
      });
    });

    it('should calculate PnL across multiple levels', () => {
      strategy.checkPriceMovement(20000);
      strategy.checkPriceMovement(21000);
      strategy.checkPriceMovement(22000);
      strategy.checkPriceMovement(23000);

      const pnl = strategy.getCurrentProfitLoss(21000);
      const boughtQty = (100000/10)/20000 + (100000/10)/21000;
      const soldValue = (100000/10)/20000 * 22000;
      const inventoryValue = (100000/10)/21000 * 21000;
      const totalCostOfBuys = 2 * (100000 / 10);
      const totalBuysCost = 2 * (100000 / 10);
      const soldProfit = (100000/10)/20000 * 22000;
      const remainingValue = (100000/10)/21000 * 21000;
      expect(pnl).toBeCloseTo(1385.28, 2); // Allowing 2 decimal places for calculation precision
    });

    it('should record valid timestamps', () => {
      strategy.checkPriceMovement(20000);
      strategy.checkPriceMovement(21000);
      const order = strategy.getTradeHistory()[0];
      expect(order.timestamp).toBeInstanceOf(Date);
      expect(order.timestamp.getTime()).toBeLessThanOrEqual(Date.now());
    });

    it('should maintain complete trade history', () => {
      const testPrices = [25000, 26000, 27000, 26000, 25000];
      testPrices.forEach(p => strategy.checkPriceMovement(p));

      const history = strategy.getTradeHistory();
      expect(history.length).toBe(4);
      history.forEach(order => {
        expect(order.quantity).toBeGreaterThan(0);
        expect(order.price).toBeGreaterThan(0);
      });
    });
  });
});