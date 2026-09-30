const roleMiddleware = require('../../src/middleware/roleMiddleware');
const ROLES = require('../../src/config/role');

describe('roleMiddleware', () => {
  let req, res, next;

  beforeEach(() => {
    req = {};
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    next = jest.fn();
  });

  test('ska släppa igenom (kalla på next) om användaren har tillåten roll', () => {
    req.user = { role: ROLES.DOCTOR }; 

    const middleware = roleMiddleware(ROLES.DOCTOR, ROLES.NURSE);
    middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  test('ska returnera 403 om användaren har fel roll', () => {
    req.user = { role: ROLES.PATIENT }; 

    const middleware = roleMiddleware(ROLES.DOCTOR, ROLES.NURSE);
    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: 'Åtkomst nekad.'
    });
    expect(next).not.toHaveBeenCalled();
  });

  test('ska returnera 401 om req.user saknas (inte autentiserad)', () => {
    const middleware = roleMiddleware(ROLES.DOCTOR);
    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: 'Du måste vara inloggad.'
    });
    expect(next).not.toHaveBeenCalled();
  });

  test('ska neka åtkomst för rollen ROLES.UNAUTHORIZED ("obehörig")', () => {
    req.user = { role: ROLES.UNAUTHORIZED };

    const middleware = roleMiddleware(ROLES.DOCTOR, ROLES.PATIENT);
    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
});