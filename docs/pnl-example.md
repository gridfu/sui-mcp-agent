# PnL Calculation Example

Order History:

```js
[
  {
    type: 'buy',
    price: 20000,
    quantity: 0.5,
    timestamp: 2025-03 - 27T13: 16: 20.734Z,
    gridIndex: 0
  },
  {
    type: 'sell',
    price: 21000,
    quantity: 0.5,
    timestamp: 2025-03 - 27T13: 16: 20.734Z,
    gridIndex: 1

  },
  {
    type: 'buy',
    price: 21000,
    quantity: 0.47619047619047616,
    timestamp: 2025-03 - 27T13: 16: 20.734Z,
    gridIndex: 1

  },
  {
    type: 'buy',
    price: 20000,
    quantity: 0.5,
    timestamp: 2025-03 - 27T13: 16: 20.734Z,
    gridIndex: 0
  }
]
```

At Current Price $20,000:

1. Total Buy Quantity: 0.5 + 0.47619 + 0.5 = 1.47619 BTC
2. Total Buy Cost: (0.5×20,000) + (0.47619×21,000) + (0.5×20,000) = $30,000
3. Total Sell Revenue: 0.5×21,000 = $10,500
4. Realized PnL: $10,500 - $10,000(same grid) = $500
5. Remaining Inventory: 1.47619 - 0.5 = 0.97619 BTC
6. Unrealized PnL: (0.97619×20,000) - ((0.5×20,000) + (0.47619×21,000)) = $19,523.80 - $20,000 = -$476.20

Total PnL = Realized PnL + Unrealized PnL = $500 - $476.20 = $23.80
