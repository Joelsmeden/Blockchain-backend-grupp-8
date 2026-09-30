const Blockchain = require('../../src/blockchain/Blockchain');

describe('Blockchain', () => {
  test('ska skapa en kedja med ett genesis-block', () => {
    const blockchain = new Blockchain();
    expect(blockchain.chain).toBeDefined();
    expect(blockchain.chain.length).toBeGreaterThan(0);
  });
});