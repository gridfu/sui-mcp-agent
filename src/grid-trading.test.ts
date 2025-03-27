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
      // what will happen at each price:
      // 1. buy at 20000
      // 2. sell at 21000
      // 3. try to sell at 22000, but will sell nothing due to no buy order yet
      // 4. try to sell at 23000, but will sell nothing due to no buy order yet
      // 5. buy at 22000
      // 6. buy at 21000
      prices.forEach(price => strategy.checkPriceMovement(price));

      const history = strategy.getTradeHistory();
      expect(history.length).toBe(4);

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
      console.log("history: ", history);
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

    // it('should handle price oscillation within same grid level', () => {
    //   const prices = [20500, 20600, 20400, 20300, 20700, 20400];
    //   prices.forEach(price => strategy.checkPriceMovement(price));

    //   const history = strategy.getTradeHistory();
    //   expect(history.length).toBe(1);
    //   expect(history[0].type).toBe('buy');
    //   expect(history[0].price).toBe(20500);
    //   expect(history[0].gridIndex).toBe(0);
    // });

    // it('should maintain correct order sequence for complex price movements', () => {
    //   const prices = [20000, 20200, 21000, 22000, 22200, 22000, 21000, 20000];
    //   prices.forEach(price => strategy.checkPriceMovement(price));

    //   const history = strategy.getTradeHistory();
    //   expect(history.length).toBe(5);

    //   // Verify order sequence
    //   const expectedPrices = [20000, 21000, 22000, 21000, 20000];
    //   const expectedGridIndices = [0, 1, 2, 1, 0];
    //   const orderTypes = ['buy', 'sell', 'buy', 'buy', 'buy'];

    //   history.forEach((order, index) => {
    //     expect(order.type).toBe(orderTypes[index]);
    //     expect(order.price).toBe(expectedPrices[index]);
    //     expect(order.gridIndex).toBe(expectedGridIndices[index]);
    //     expect(order.timestamp).toBeInstanceOf(Date);
    //   });
    // });

    // describe('PnL calculation details', () => {
    //   beforeEach(() => {
    //     strategy = new GridTradingStrategy(config);
    //   });

    //   it('should subtract initial investment from total value', () => {
    //     strategy.checkPriceMovement(20000);
    //     strategy.checkPriceMovement(21000);

    //     const pnl = strategy.getCurrentProfitLoss(21000);
    //     let buyAmount = 100000/10/20000;
    //     const expectedPnL = buyAmount * (21000 - 20000);
    //     expect(pnl).toBeCloseTo(expectedPnL);
    //   });

    //   it('should calculate inventory value at current price', () => {
    //     strategy.checkPriceMovement(20000);
    //     strategy.checkPriceMovement(21000);
    //     strategy.checkPriceMovement(22000);
    //     const history = strategy.getTradeHistory();
    //     console.log(history);
    //     // check all history
    //     expect(history.length).toBe(3);
    //     expect(history[0].type).toBe('buy');
    //     expect(history[0].price).toBe(20000);
    //     expect(history[0].quantity).toBeCloseTo(100000/10/20000);
    //     expect(history[0].timestamp).toBeInstanceOf(Date);
    //     expect(history[0].gridIndex).toBe(0);
    //     expect(history[1].type).toBe('sell');
    //     expect(history[1].price).toBe(21000);
    //     expect(history[1].quantity).toBeCloseTo(100000/10/21000);
    //     expect(history[1].timestamp).toBeInstanceOf(Date);
    //     expect(history[1].gridIndex).toBe(1);
    //     expect(history[2].type).toBe('sell');
    //     expect(history[2].price).toBe(22000);
    //     expect(history[2].quantity).toBeCloseTo(100000/10/22000);
    //     expect(history[2].timestamp).toBeInstanceOf(Date);
    //     expect(history[2].gridIndex).toBe(2);
    //     const inventoryValue = history.reduce((acc, order) => {
    //       if (order.type === 'buy') {
    //         return acc + order.quantity * order.price;
    //       } else {
    //         return acc - order.quantity * order.price;
    //       }
    //     }, 0);
    //     // print inventoryValue
    //     console.log(inventoryValue);
    //     expect(inventoryValue).toBeCloseTo(100000/10/20000 * 20000);
    //     const pnl = strategy.getCurrentProfitLoss(22000);
    //     // inventoryValue = boughtQty * currentPrice - soldQty * currentPrice
    //     // const inventoryValue = (100000/10/20000 * 20000) - (100000/10/21000 * 22000);
    //     const expectedPnL = inventoryValue - (100000/10 * 2) + (100000/10/21000 * 22000);
    //     expect(pnl).toBeCloseTo(expectedPnL);
    //   });

    //   it('should track accumulated realized profits', () => {
    //     strategy.checkPriceMovement(20000);
    //     strategy.checkPriceMovement(21000);
    //     strategy.checkPriceMovement(22000);
    //     strategy.checkPriceMovement(21000);

    //     const pnl = strategy.getCurrentProfitLoss(20000);
    //     const realizedProfit = (100000/10/20000 * 21000) - (100000/10/21000 * 22000);
    //     expect(pnl).toBeCloseTo(realizedProfit - 100000);
    //   });

    //   it('should handle partial sells with remaining inventory', () => {
    //     // Initial buy
    //     strategy.checkPriceMovement(20000);

    //     // Partial sell at higher level
    //     strategy.checkPriceMovement(21000);
    //     strategy.checkPriceMovement(20000);

    //     const pnl = strategy.getCurrentProfitLoss(20000);
    //     const remainingQty = 100000/10/20000 - 100000/10/21000;
    //     const expectedPnL = (remainingQty * 20000) - (100000/10) + (100000/10/21000 * 21000);
    //     expect(pnl).toBeCloseTo(expectedPnL);
    //   });
    // });

    // it('should calculate PnL across multiple levels', () => {
    //   strategy.checkPriceMovement(20000);
    //   strategy.checkPriceMovement(21000);
    //   strategy.checkPriceMovement(22000);
    //   strategy.checkPriceMovement(23000);

    //   const pnl = strategy.getCurrentProfitLoss(21000);
    //   const boughtQty = (100000/10)/20000 + (100000/10)/21000;
    //   const soldValue = (100000/10)/20000 * 22000;
    //   const inventoryValue = (100000/10)/21000 * 21000;
    //   const totalCostOfBuys = 2 * (100000 / 10);
    //   const totalBuysCost = 2 * (100000 / 10);
    //   const soldProfit = (100000/10)/20000 * 22000;
    //   const remainingValue = (100000/10)/21000 * 21000;
    //   expect(pnl).toBeCloseTo(1385.28, 2); // Allowing 2 decimal places for calculation precision
    // });

    // it('should record valid timestamps', () => {
    //   strategy.checkPriceMovement(20000);
    //   strategy.checkPriceMovement(21000);
    //   const order = strategy.getTradeHistory()[0];
    //   expect(order.timestamp).toBeInstanceOf(Date);
    //   expect(order.timestamp.getTime()).toBeLessThanOrEqual(Date.now());
    // });

    // it('should maintain complete trade history', () => {
    //   const testPrices = [25000, 26000, 27000, 26000, 25000];
    //   testPrices.forEach(p => strategy.checkPriceMovement(p));

    //   const history = strategy.getTradeHistory();
    //   expect(history.length).toBe(4);
    //   history.forEach(order => {
    //     expect(order.quantity).toBeGreaterThan(0);
    //     expect(order.price).toBeGreaterThan(0);
    //   });
    // });
  });
});