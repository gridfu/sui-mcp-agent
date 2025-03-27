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
      expect(strategy.getCurrentGridIndex(19999)).toEqual(-1);
      expect(strategy.getCurrentGridIndex(30001)).toEqual(-1);
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
      expect(history.length).toBe(4);

      // Verify PnL matches FIFO calculation
      const fifoPnl = strategy.getCurrentProfitLoss(21000);
      expect(fifoPnl).toBeCloseTo(45.45, 2);
      // Verify order sequence
      const expectedPrices = [20000, 21000, 22000, 21000];
      const expectedGridIndices = [0, 1, 2, 1];
      const orderTypes = ['buy', 'sell', 'buy', 'buy'];
      const orderQuantity = [0.5, 0.5, 0.45454545454545453, 0.47619047619047616];

      history.forEach((order, index) => {
        expect(order.type).toBe(orderTypes[index]);
        expect(order.price).toBe(expectedPrices[index]);
        expect(order.gridIndex).toBe(expectedGridIndices[index]);
        expect(order.timestamp).toBeInstanceOf(Date);
        expect(order.quantity).toBe(orderQuantity[index]);
      });
    });

    it('should execute orders correctly for upward price movement', () => {
      const prices = [20000, 21000, 22000, 23000, 24000, 25000];
      prices.forEach(price => strategy.checkPriceMovement(price));

      const history = strategy.getTradeHistory();
      expect(history.length).toBe(2);
      // Verify order sequence
      const expectedPrices = [20000, 21000];
      const expectedGridIndices = [0, 1];
      const orderTypes = ['buy', 'sell'];
      const orderQuantity = [0.5, 0.5];

      history.forEach((order, index) => {
        expect(order.type).toBe(orderTypes[index]);
        expect(order.price).toBe(expectedPrices[index]);
        expect(order.gridIndex).toBe(expectedGridIndices[index]);
        expect(order.timestamp).toBeInstanceOf(Date);
        expect(order.quantity).toBe(orderQuantity[index]);
      });
    });

    it('should execute orders correctly for downward price movement', () => {
      const prices = [25000, 24000, 23000, 22000, 21000, 20000];
      prices.forEach(price => strategy.checkPriceMovement(price));

      const history = strategy.getTradeHistory();
      expect(history.length).toBe(5);

      // Verify all orders are buy orders
      history.forEach(order => {
        expect(order.type).toBe('buy');
        expect(order.timestamp).toBeInstanceOf(Date);
      });

      // Check order sequence and quantities
      const expectedPrices = [24000, 23000, 22000, 21000, 20000];
      const expectedGridIndices = [4, 3, 2, 1, 0];

      history.forEach((order, index) => {
        expect(order.price).toBe(expectedPrices[index]);
        expect(order.gridIndex).toBe(expectedGridIndices[index]);
        expect(order.quantity).toBeCloseTo(10000 / order.price);
      });
    });

    it('should handle price oscillation within same grid level', () => {
      const prices = [20500, 20600, 20400, 20300, 20700, 20400];
      prices.forEach(price => strategy.checkPriceMovement(price));

      const history = strategy.getTradeHistory();
      expect(history.length).toBe(1);
      expect(history[0].type).toBe('buy');
      expect(history[0].price).toBe(20500);
      expect(history[0].gridIndex).toBe(0);
    });

    it('should maintain correct order sequence for complex price movements', () => {
      const prices = [20000, 20200, 21000, 22000, 22200, 22000, 21000, 20000];
      prices.forEach(price => strategy.checkPriceMovement(price));
      const history = strategy.getTradeHistory();
      // do not buy when price drop from 22200 to 22000, because it does not cross the grid level
      expect(history.length).toBe(4);

      // Verify order sequence
      const expectedPrices = [20000, 21000, 21000, 20000];
      const expectedGridIndices = [0, 1, 1, 0];
      const orderTypes = ['buy', 'sell', 'buy', 'buy'];

      history.forEach((order, index) => {
        expect(order.type).toBe(orderTypes[index]);
        expect(order.price).toBe(expectedPrices[index]);
        expect(order.gridIndex).toBe(expectedGridIndices[index]);
        expect(order.timestamp).toBeInstanceOf(Date);
      });
    });

    it('should calculate PnL for mixed buy and sell orders', () => {
      const prices = [20000, 21000, 22000, 21000, 20000];
      prices.forEach(price => strategy.checkPriceMovement(price));
      const history = strategy.getTradeHistory();
      // Verify PnL matches FIFO calculation
      const fifoPnl = strategy.getCurrentProfitLoss(20000);
      expect(fifoPnl).toBeCloseTo(23.81, 2);
    });

    describe('PnL calculation details', () => {
      beforeEach(() => {
        strategy = new GridTradingStrategy(config);
      });

      it('should subtract initial investment from total value', () => {
        strategy.checkPriceMovement(20000);
        strategy.checkPriceMovement(21000);

        const pnl = strategy.getCurrentProfitLoss(21000);
        let buyAmount = 100000/10/20000;
        const expectedPnL = buyAmount * (21000 - 20000);
        expect(pnl).toBeCloseTo(expectedPnL);
      });

      it('should calculate inventory value at current price', () => {
        const prices = [20000, 21000, 22000];
        prices.forEach(price => strategy.checkPriceMovement(price));
        const history = strategy.getTradeHistory();
        // check all history
        expect(history.length).toBe(2);

        // Verify order sequence
        const expectedPrices = [20000, 21000];
        const expectedGridIndices = [0, 1];
        const orderTypes = ['buy', 'sell'];
        history.forEach((order, index) => {
          expect(order.type).toBe(orderTypes[index]);
          expect(order.price).toBe(expectedPrices[index]);
          expect(order.gridIndex).toBe(expectedGridIndices[index]);
          expect(order.timestamp).toBeInstanceOf(Date);
        });
        // verify Profit and Loss
        // inventoryAmt = boughtQty - soldQty
        const inventoryAmt = history.reduce((acc, order) => {
          if (order.type === 'buy') {
            return acc - order.quantity;
          } else {
            return acc + order.quantity;
          }
        }, 0);
        expect(inventoryAmt).toBeCloseTo(0);
        const inventoryValue = inventoryAmt * 22000;
        expect(inventoryValue).toBeCloseTo(0);
        const pnl = strategy.getCurrentProfitLoss(22000);
        let buyAmount = 100000 / 10 / 20000;
        const expectedPnL = buyAmount * (21000 - 20000);
        expect(pnl).toBeCloseTo(expectedPnL);
      });
    });

  });
});