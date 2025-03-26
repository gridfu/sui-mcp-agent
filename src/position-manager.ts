import { z } from 'zod';

export interface Position {
  baseToken: string;
  quoteToken: string;
  baseAmount: number;
  quoteAmount: number;
  averageEntryPrice: number;
}

export interface Order {
  id: string;
  type: 'buy' | 'sell';
  price: number;
  size: number;
  status: 'pending' | 'filled' | 'cancelled';
  timestamp: number;
}

export interface PositionManagerConfig {
  maxLeverage?: number;
  minOrderSize?: number;
  maxOrderSize?: number;
  profitTarget?: number;
  stopLoss?: number;
}

export class PositionManager {
  private position: Position;
  private orders: Map<string, Order>;
  private config: PositionManagerConfig;

  constructor(
    baseToken: string,
    quoteToken: string,
    config: PositionManagerConfig = {}
  ) {
    this.position = {
      baseToken,
      quoteToken,
      baseAmount: 0,
      quoteAmount: 0,
      averageEntryPrice: 0,
    };
    this.orders = new Map<string, Order>();
    this.config = {
      maxLeverage: config.maxLeverage || 3,
      minOrderSize: config.minOrderSize || 0.01,
      maxOrderSize: config.maxOrderSize || 100,
      profitTarget: config.profitTarget || 0.02, // 2% profit target
      stopLoss: config.stopLoss || 0.05, // 5% stop loss
    };
  }

  public createOrder(type: 'buy' | 'sell', price: number, size: number): Order {
    this.validateOrderParams(type, price, size);

    const order: Order = {
      id: this.generateOrderId(),
      type,
      price,
      size,
      status: 'pending',
      timestamp: Date.now(),
    };

    this.orders.set(order.id, order);
    return order;
  }

  public executeOrder(orderId: string, executionPrice?: number): void {
    const order = this.orders.get(orderId);
    if (!order || order.status !== 'pending') {
      throw new Error('Invalid order or order already executed');
    }

    const finalPrice = executionPrice || order.price;

    if (order.type === 'buy') {
      const quoteAmount = order.size * finalPrice;
      // Check quote balance for all positions
      if (this.position.quoteAmount < quoteAmount) {
        throw new Error('Insufficient quote token balance');
      }
      this.position.quoteAmount -= quoteAmount;
      this.position.baseAmount += order.size;
    } else {
      if (this.position.baseAmount < order.size) {
        throw new Error('Insufficient base token balance');
      }
      this.position.baseAmount -= order.size;
      this.position.quoteAmount += order.size * finalPrice;
    }

    this.updateAverageEntryPrice(order.type, finalPrice, order.size);
    order.status = 'filled';
    this.orders.set(orderId, order); // Ensure the order status is updated in the map
}

  public cancelOrder(orderId: string): void {
    const order = this.orders.get(orderId);
    if (!order || order.status !== 'pending') {
      throw new Error('Invalid order or order already executed/cancelled');
    }
    order.status = 'cancelled';
  }

  public getPosition(): Position {
    return { ...this.position };
  }

  public getOrders(): Order[] {
    return Array.from(this.orders.values());
  }

  public getPendingOrders(): Order[] {
    return this.getOrders().filter(order => order.status === 'pending');
  }

  public calculateUnrealizedPnL(currentPrice: number): number {
    const positionValue = this.position.baseAmount * currentPrice;
    const cost = this.position.baseAmount * this.position.averageEntryPrice;
    return positionValue - cost;
  }

  public calculateRealizedPnL(): number {
    const filledOrders = this.getOrders().filter(order => order.status === 'filled');
    let totalPnL = 0;

    for (const order of filledOrders) {
      if (order.type === 'sell') {
        const profit = (order.price - this.position.averageEntryPrice) * order.size;
        totalPnL += profit;
      }
    }

    return totalPnL;
  }

  private validateOrderParams(type: 'buy' | 'sell', price: number, size: number): void {
    if (price <= 0) throw new Error('Price must be positive');
    if (size < this.config.minOrderSize!) {
      throw new Error(`Order size must be at least ${this.config.minOrderSize}`);
    }
    if (size > this.config.maxOrderSize!) {
      throw new Error(`Order size must not exceed ${this.config.maxOrderSize}`);
    }

    if (type === 'buy') {
      const orderValue = price * size;
      // Only check quote balance for non-initial positions
      if (this.position.baseAmount > 0 && orderValue > this.position.quoteAmount) {
        throw new Error('Insufficient quote token balance');
      }

      // Only check leverage for non-initial positions
      if (this.position.baseAmount > 0) {
        const totalExposure = this.calculateTotalExposure(price, size);
        if (totalExposure > this.config.maxLeverage!) {
          throw new Error(`Total exposure exceeds maximum leverage of ${this.config.maxLeverage}x`);
        }
      }
    }
  }

  private calculateTotalExposure(price: number, size: number): number {
    const currentPositionValue = this.position.baseAmount * price;
    const newOrderValue = size * price;
    // If there's no quote amount yet, just calculate based on the new order
    if (this.position.quoteAmount === 0) {
      return 1; // Initial position is always 1x leverage
    }
    return (currentPositionValue + newOrderValue) / this.position.quoteAmount;
  }

  private updateAverageEntryPrice(type: 'buy' | 'sell', price: number, size: number): void {
    if (type === 'buy') {
      const totalValue = (this.position.averageEntryPrice * (this.position.baseAmount - size)) +
                        (price * size);
      this.position.averageEntryPrice = totalValue / this.position.baseAmount;
    }
  }

  private generateOrderId(): string {
    return `order-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}