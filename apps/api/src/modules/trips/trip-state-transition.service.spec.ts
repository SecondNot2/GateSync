import assert from 'node:assert/strict';
import test from 'node:test';
import { BadRequestException } from '@nestjs/common';
import { TripStateTransitionService } from './trip-state-transition.service';

const service = new TripStateTransitionService();

test('projects valid trip events into current status updates', () => {
  assert.equal(service.assertCanApplyEvent('PLANNED', 'DEPARTED'), 'IN_PROGRESS');
  assert.equal(service.assertCanApplyEvent('IN_PROGRESS', 'WAITING_YARD_ENTRY'), 'WAITING_YARD_ENTRY');
  assert.equal(service.assertCanApplyEvent('WAITING_YARD_ENTRY', 'YARD_ENTRY_CONFIRMED'), 'IN_YARD');
});

test('allows operational notes without changing trip status', () => {
  assert.equal(service.assertCanApplyEvent('IN_YARD', 'DRIVER_NOTE_ADDED'), undefined);
});

test('blocks invalid state transitions', () => {
  assert.throws(
    () => service.assertCanApplyEvent('PLANNED', 'YARD_ENTRY_CONFIRMED'),
    BadRequestException
  );
});

test('blocks status-changing events after terminal status', () => {
  assert.throws(() => service.assertCanApplyEvent('COMPLETED', 'DEPARTED'), BadRequestException);
  assert.throws(() => service.assertCanApplyEvent('CANCELLED', 'TRIP_COMPLETED'), BadRequestException);
});
