const { publishNotificationEvent } = require('../notifications/events/publishEvent');

describe('publishNotificationEvent', () => {
  test('uses injected prisma client when provided', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'evt_1' });
    const prisma = {
      notificationOutboxEvent: {
        create
      }
    };

    const result = await publishNotificationEvent({
      prisma,
      topic: 'booking.created',
      payload: { bookingId: 'b1' }
    });

    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0]).toEqual({
      data: expect.objectContaining({
        topic: 'booking.created',
        payload: { bookingId: 'b1' }
      })
    });
    expect(result).toEqual({ id: 'evt_1' });
  });

  test('dedupes on P2002 when dedupeKey is provided', async () => {
    const create = jest.fn().mockRejectedValue({ code: 'P2002' });
    const findUnique = jest.fn().mockResolvedValue({ id: 'evt_existing' });

    const prisma = {
      notificationOutboxEvent: {
        create,
        findUnique
      }
    };

    const result = await publishNotificationEvent({
      prisma,
      topic: 'booking.created',
      payload: { bookingId: 'b1' },
      dedupeKey: 'booking-created:b1'
    });

    expect(create).toHaveBeenCalledTimes(1);
    expect(findUnique).toHaveBeenCalledTimes(1);
    expect(findUnique).toHaveBeenCalledWith({ where: { dedupeKey: 'booking-created:b1' } });
    expect(result).toEqual({ id: 'evt_existing' });
  });
});
