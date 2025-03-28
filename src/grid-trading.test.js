"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
Object.defineProperty(exports, "__esModule", { value: true });
var grid_trading_1 = require("./grid-trading");
describe('GridTradingStrategy', function () {
    var config;
    beforeEach(function () {
        config = {
            upperPrice: 30000, // $30,000
            lowerPrice: 20000, // $20,000
            gridCount: 10,
            totalInvestment: 100000, // $100,000
            baseToken: 'BTC',
            quoteToken: 'USDT'
        };
    });
    describe('constructor and validation', function () {
        it('should create grid levels correctly', function () {
            var strategy = new grid_trading_1.GridTradingStrategy(config);
            var levels = strategy.getGridLevels();
            expect(levels.length).toBe(11); // gridCount + 1 levels
            expect(levels[0].price).toBe(20000);
            expect(levels[levels.length - 1].price).toBe(30000);
        });
        it('should throw error for invalid price range', function () {
            var invalidConfig = __assign(__assign({}, config), { upperPrice: 19000 }); // Upper price less than lower price
            expect(function () { return new grid_trading_1.GridTradingStrategy(invalidConfig); }).toThrow('Upper price must be greater than lower price');
        });
        it('should throw error for invalid grid count', function () {
            var invalidConfig = __assign(__assign({}, config), { gridCount: 1 });
            expect(function () { return new grid_trading_1.GridTradingStrategy(invalidConfig); }).toThrow('Grid count must be at least 2');
        });
        it('should throw error for invalid investment amount', function () {
            var invalidConfig = __assign(__assign({}, config), { totalInvestment: 0 });
            expect(function () { return new grid_trading_1.GridTradingStrategy(invalidConfig); }).toThrow('Total investment must be greater than 0');
        });
    });
    describe('grid calculations', function () {
        var strategy;
        beforeEach(function () {
            strategy = new grid_trading_1.GridTradingStrategy(config);
        });
        it('should calculate grid spacing correctly', function () {
            var levels = strategy.getGridLevels();
            var expectedSpacing = 1000; // (30000 - 20000) / 10
            for (var i = 1; i < levels.length; i++) {
                expect(levels[i].price - levels[i - 1].price).toBeCloseTo(expectedSpacing);
            }
        });
        it('should calculate order sizes correctly', function () {
            var levels = strategy.getGridLevels();
            var investmentPerGrid = config.totalInvestment / config.gridCount;
            levels.forEach(function (level, i) {
                var expectedBuySize = investmentPerGrid / level.price;
                var expectedSellSize = i > 0 ? investmentPerGrid / levels[i - 1].price : 0;
                expect(level.buyOrderSize).toBeCloseTo(expectedBuySize);
                expect(level.sellOrderSize).toBeCloseTo(expectedSellSize);
            });
        });
    });
    describe('price level management', function () {
        var strategy;
        beforeEach(function () {
            strategy = new grid_trading_1.GridTradingStrategy(config);
        });
        it('should get correct grid index for current price', function () {
            expect(strategy.getCurrentGridIndex(25000)).toBe(5); // Middle of the grid
            expect(strategy.getCurrentGridIndex(20000)).toBe(0); // Lower boundary
            expect(strategy.getCurrentGridIndex(30000)).toBe(10); // Upper boundary
        });
        it('should throw error for price outside grid range', function () {
            expect(strategy.getCurrentGridIndex(19999)).toEqual(-1);
            expect(strategy.getCurrentGridIndex(30001)).toEqual(-1);
        });
        it('should get correct next buy price', function () {
            expect(strategy.getNextBuyPrice(25000)).toBe(24000); // One level down
            expect(strategy.getNextBuyPrice(20000)).toBe(-1); // At bottom, no buy price
        });
        it('should get correct next sell price', function () {
            expect(strategy.getNextSellPrice(25000)).toBe(26000); // One level up
            expect(strategy.getNextSellPrice(30000)).toBe(-1); // At top, no sell price
        });
        it('should get correct order size at price', function () {
            var level = strategy.getGridLevels()[5]; // Middle level
            var price = level.price;
            expect(strategy.getOrderSizeAtPrice(price, 'buy')).toBe(level.buyOrderSize);
            expect(strategy.getOrderSizeAtPrice(price, 'sell')).toBe(level.sellOrderSize);
        });
    });
    describe('edge cases', function () {
        it('should handle minimum grid count', function () {
            var minConfig = __assign(__assign({}, config), { gridCount: 2 });
            var strategy = new grid_trading_1.GridTradingStrategy(minConfig);
            var levels = strategy.getGridLevels();
            expect(levels.length).toBe(3);
            expect(levels[0].price).toBe(20000);
            expect(levels[2].price).toBe(30000);
        });
        it('should handle small price range', function () {
            var smallRangeConfig = __assign(__assign({}, config), { upperPrice: 20100, lowerPrice: 20000, gridCount: 2 });
            var strategy = new grid_trading_1.GridTradingStrategy(smallRangeConfig);
            var levels = strategy.getGridLevels();
            expect(levels[1].price - levels[0].price).toBeCloseTo(50);
        });
        it('should handle large numbers', function () {
            var largeConfig = __assign(__assign({}, config), { upperPrice: 1000000, lowerPrice: 100000, totalInvestment: 10000000 });
            var strategy = new grid_trading_1.GridTradingStrategy(largeConfig);
            var levels = strategy.getGridLevels();
            expect(levels.length).toBe(11);
            expect(levels[0].price).toBe(100000);
            expect(levels[10].price).toBe(1000000);
        });
    });
    describe('execution triggers and PnL', function () {
        var strategy;
        beforeEach(function () {
            strategy = new grid_trading_1.GridTradingStrategy(config);
        });
        it('should execute orders when crossing grid levels', function () {
            var prices = [20000, 21000, 22000, 23000, 22000, 21000];
            prices.forEach(function (price) { return strategy.checkPriceMovement(price); });
            var history = strategy.getTradeHistory();
            expect(history.length).toBe(4);
            // Verify PnL matches FIFO calculation
            var fifoPnl = strategy.getCurrentProfitLoss(21000);
            expect(fifoPnl).toBeCloseTo(45.45, 2);
            // Verify order sequence
            var expectedPrices = [20000, 21000, 22000, 21000];
            var expectedGridIndices = [0, 1, 2, 1];
            var orderTypes = ['buy', 'sell', 'buy', 'buy'];
            var orderQuantity = [0.5, 0.5, 0.45454545454545453, 0.47619047619047616];
            history.forEach(function (order, index) {
                expect(order.type).toBe(orderTypes[index]);
                expect(order.price).toBe(expectedPrices[index]);
                expect(order.gridIndex).toBe(expectedGridIndices[index]);
                expect(order.timestamp).toBeInstanceOf(Date);
                expect(order.quantity).toBe(orderQuantity[index]);
            });
        });
        it('should execute orders correctly for upward price movement', function () {
            var prices = [20000, 21000, 22000, 23000, 24000, 25000];
            prices.forEach(function (price) { return strategy.checkPriceMovement(price); });
            var history = strategy.getTradeHistory();
            expect(history.length).toBe(2);
            // Verify order sequence
            var expectedPrices = [20000, 21000];
            var expectedGridIndices = [0, 1];
            var orderTypes = ['buy', 'sell'];
            var orderQuantity = [0.5, 0.5];
            history.forEach(function (order, index) {
                expect(order.type).toBe(orderTypes[index]);
                expect(order.price).toBe(expectedPrices[index]);
                expect(order.gridIndex).toBe(expectedGridIndices[index]);
                expect(order.timestamp).toBeInstanceOf(Date);
                expect(order.quantity).toBe(orderQuantity[index]);
            });
        });
        it('should execute orders correctly for downward price movement', function () {
            var prices = [25000, 24000, 23000, 22000, 21000, 20000];
            prices.forEach(function (price) { return strategy.checkPriceMovement(price); });
            var history = strategy.getTradeHistory();
            expect(history.length).toBe(5);
            // Verify all orders are buy orders
            history.forEach(function (order) {
                expect(order.type).toBe('buy');
                expect(order.timestamp).toBeInstanceOf(Date);
            });
            // Check order sequence and quantities
            var expectedPrices = [24000, 23000, 22000, 21000, 20000];
            var expectedGridIndices = [4, 3, 2, 1, 0];
            history.forEach(function (order, index) {
                expect(order.price).toBe(expectedPrices[index]);
                expect(order.gridIndex).toBe(expectedGridIndices[index]);
                expect(order.quantity).toBeCloseTo(10000 / order.price);
            });
        });
        it('should handle price oscillation within same grid level', function () {
            var prices = [20500, 20600, 20400, 20300, 20700, 20400];
            prices.forEach(function (price) { return strategy.checkPriceMovement(price); });
            var history = strategy.getTradeHistory();
            expect(history.length).toBe(1);
            expect(history[0].type).toBe('buy');
            expect(history[0].price).toBe(20500);
            expect(history[0].gridIndex).toBe(0);
        });
        it('should maintain correct order sequence for complex price movements', function () {
            var prices = [20000, 20200, 21000, 22000, 22200, 22000, 21000, 20000];
            prices.forEach(function (price) { return strategy.checkPriceMovement(price); });
            var history = strategy.getTradeHistory();
            // do not buy when price drop from 22200 to 22000, because it does not cross the grid level
            expect(history.length).toBe(4);
            // Verify order sequence
            var expectedPrices = [20000, 21000, 21000, 20000];
            var expectedGridIndices = [0, 1, 1, 0];
            var orderTypes = ['buy', 'sell', 'buy', 'buy'];
            history.forEach(function (order, index) {
                expect(order.type).toBe(orderTypes[index]);
                expect(order.price).toBe(expectedPrices[index]);
                expect(order.gridIndex).toBe(expectedGridIndices[index]);
                expect(order.timestamp).toBeInstanceOf(Date);
            });
        });
        it('should calculate PnL for mixed buy and sell orders', function () {
            var prices = [20000, 21000, 22000, 21000, 20000];
            prices.forEach(function (price) { return strategy.checkPriceMovement(price); });
            var history = strategy.getTradeHistory();
            // Verify PnL matches FIFO calculation
            var fifoPnl = strategy.getCurrentProfitLoss(20000);
            expect(fifoPnl).toBeCloseTo(23.81, 2);
        });
        describe('PnL calculation details', function () {
            beforeEach(function () {
                strategy = new grid_trading_1.GridTradingStrategy(config);
            });
            it('should subtract initial investment from total value', function () {
                strategy.checkPriceMovement(20000);
                strategy.checkPriceMovement(21000);
                var pnl = strategy.getCurrentProfitLoss(21000);
                var buyAmount = 100000 / 10 / 20000;
                var expectedPnL = buyAmount * (21000 - 20000);
                expect(pnl).toBeCloseTo(expectedPnL);
            });
            it('should calculate inventory value at current price', function () {
                var prices = [20000, 21000, 22000];
                prices.forEach(function (price) { return strategy.checkPriceMovement(price); });
                var history = strategy.getTradeHistory();
                // check all history
                expect(history.length).toBe(2);
                // Verify order sequence
                var expectedPrices = [20000, 21000];
                var expectedGridIndices = [0, 1];
                var orderTypes = ['buy', 'sell'];
                history.forEach(function (order, index) {
                    expect(order.type).toBe(orderTypes[index]);
                    expect(order.price).toBe(expectedPrices[index]);
                    expect(order.gridIndex).toBe(expectedGridIndices[index]);
                    expect(order.timestamp).toBeInstanceOf(Date);
                });
                // verify Profit and Loss
                // inventoryAmt = boughtQty - soldQty
                var inventoryAmt = history.reduce(function (acc, order) {
                    if (order.type === 'buy') {
                        return acc - order.quantity;
                    }
                    else {
                        return acc + order.quantity;
                    }
                }, 0);
                expect(inventoryAmt).toBeCloseTo(0);
                var inventoryValue = inventoryAmt * 22000;
                expect(inventoryValue).toBeCloseTo(0);
                var pnl = strategy.getCurrentProfitLoss(22000);
                var buyAmount = 100000 / 10 / 20000;
                var expectedPnL = buyAmount * (21000 - 20000);
                expect(pnl).toBeCloseTo(expectedPnL);
            });
        });
    });
});
