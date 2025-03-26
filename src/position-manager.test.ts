import { PositionManager, Position, Order, PositionManagerConfig } from './position-manager';

describe('PositionManager', () => {
  let positionManager: PositionManager;
  const baseToken = 'BTC';
  const quoteToken = 'USDT';
  const defaultConfig: PositionManagerConfig = {
    maxLeverage: 3,
    minOrderSize: 0.01,
    maxOrderSize: 100,
    profitTarget: 0.02,
    stopLoss: 0.05
  };

  beforeEach(() => {
    positionManager = new PositionManager(baseToken, quoteToken, defaultConfig);
  });

  describe('Order Management', () => {
    it('should create buy order with valid parameters', () => {
      const order = positionManager.createOrder('buy', 20000, 1);
      expect(order.type).toBe('buy');
      expect(order.price).toBe(20000);
      expect(order.size).toBe(1);
      expect(order.status).toBe('pending');
    });

    it('should throw error for invalid order size', () => {
      expect(() => positionManager.createOrder('buy', 20000, 0.001))
        .toThrow(`Order size must be at least ${defaultConfig.minOrderSize}`);
      expect(() => positionManager.createOrder('buy', 20000, 150))
        .toThrow(`Order size must not exceed ${defaultConfig.maxOrderSize}`);
    });

    it('should throw error for invalid price', () => {
      expect(() => positionManager.createOrder('buy', 0, 1))
        .toThrow('Price must be positive');
      expect(() => positionManager.createOrder('buy', -1000, 1))
        .toThrow('Price must be positive');
    });
  });

  describe('Position Management', () => {
    beforeEach(() => {
      // Add initial quote balance for testing
      const position = positionManager.getPosition();
      position.quoteAmount = 100000; // $100,000 USDT
      Object.assign(positionManager['position'], position);
    });

    it('should update position after buy order execution', () => {
      const order = positionManager.createOrder('buy', 20000, 1);
      positionManager.executeOrder(order.id);

      const position = positionManager.getPosition();
      expect(position.baseAmount).toBe(1);
      expect(position.quoteAmount).toBe(80000); // 100000 - (20000 * 1)
      expect(position.averageEntryPrice).toBe(20000);
    });

    it('should update position after sell order execution', () => {
      // First buy to have something to sell
      const buyOrder = positionManager.createOrder('buy', 20000, 1);
      positionManager.executeOrder(buyOrder.id);

      const sellOrder = positionManager.createOrder('sell', 21000, 0.5);
      positionManager.executeOrder(sellOrder.id);

      const position = positionManager.getPosition();
      expect(position.baseAmount).toBe(0.5);
      expect(position.quoteAmount).toBe(90500); // 80000 + (21000 * 0.5)
    });

    it('should throw error when selling more than available', () => {
      const buyOrder = positionManager.createOrder('buy', 20000, 1);
      positionManager.executeOrder(buyOrder.id);

      expect(() => {
        const sellOrder = positionManager.createOrder('sell', 21000, 2);
        positionManager.executeOrder(sellOrder.id);
      }).toThrow('Insufficient base token balance');
    });

    it('should throw error when buying with insufficient funds', () => {
      const position = positionManager.getPosition();
      position.quoteAmount = 1000; // Only $1,000 USDT
      position.baseAmount = 0; // Reset base amount to simulate new position
      Object.assign(positionManager['position'], position);

      expect(() => {
        const buyOrder = positionManager.createOrder('buy', 20000, 1);
        positionManager.executeOrder(buyOrder.id);
      }).toThrow('Insufficient quote token balance');
    });
  });

  describe('PnL Calculations', () => {
    beforeEach(() => {
      const position = positionManager.getPosition();
      position.quoteAmount = 100000;
      Object.assign(positionManager['position'], position);

      // Buy 1 BTC at $20,000
      const buyOrder = positionManager.createOrder('buy', 20000, 1);
      positionManager.executeOrder(buyOrder.id);
    });

    it('should calculate unrealized PnL correctly', () => {
      // Current price $22,000 (10% profit)
      expect(positionManager.calculateUnrealizedPnL(22000)).toBe(2000);

      // Current price $19,000 (5% loss)
      expect(positionManager.calculateUnrealizedPnL(19000)).toBe(-1000);
    });

    it('should calculate realized PnL correctly', () => {
      // Sell 0.5 BTC at $22,000
      const sellOrder = positionManager.createOrder('sell', 22000, 0.5);
      positionManager.executeOrder(sellOrder.id);

      // Realized PnL should be (22000 - 20000) * 0.5 = 1000
      expect(positionManager.calculateRealizedPnL()).toBe(1000);
    });
  });

  describe('Order Status Management', () => {
  beforeEach(() => {
    const position = positionManager.getPosition();
    position.quoteAmount = 100000;
    Object.assign(positionManager['position'], position);
  });

    it('should manage order lifecycle correctly', () => {
      const order = positionManager.createOrder('buy', 20000, 1);
      expect(order.status).toBe('pending');

      positionManager.executeOrder(order.id);
      expect(positionManager.getOrders()[0].status).toBe('filled');
    });

    it('should cancel pending order', () => {
      const order = positionManager.createOrder('buy', 20000, 1);
      positionManager.cancelOrder(order.id);
      expect(positionManager.getOrders()[0].status).toBe('cancelled');
    });

    it('should not cancel filled order', () => {
      const order = positionManager.createOrder('buy', 20000, 1);
      positionManager.executeOrder(order.id);
      expect(() => positionManager.cancelOrder(order.id))
        .toThrow('Invalid order or order already executed/cancelled');
    });

    it('should get pending orders correctly', () => {
      positionManager.createOrder('buy', 20000, 1);
      positionManager.createOrder('sell', 21000, 0.5);
      const order3 = positionManager.createOrder('buy', 19000, 1);
      positionManager.executeOrder(order3.id);

      const pendingOrders = positionManager.getPendingOrders();
      expect(pendingOrders.length).toBe(2);
      expect(pendingOrders.every(order => order.status === 'pending')).toBe(true);
    });
  });
});