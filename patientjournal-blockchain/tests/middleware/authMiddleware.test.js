const authMiddleware = require('../../src/middleware/authMiddleware');

describe('authMiddleware', () => {
  let req, res, next;

  beforeEach(() => {
    req = {
      session: {}
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    next = jest.fn();
  });

  test('ska släppa igenom och sätta req.user om session.user finns', () => {
    const mockUser = { id: 1, username: 'lakare1', role: 'läkare' };
    req.session.user = mockUser;

    authMiddleware(req, res, next);

    expect(req.user).toEqual(mockUser);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  test('ska returnera 401 om session saknas eller användaren inte är inloggad', () => {
    req.session = {}; 

    authMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: 'Du måste vara inloggad.'
    });
    expect(next).not.toHaveBeenCalled();
  });
});