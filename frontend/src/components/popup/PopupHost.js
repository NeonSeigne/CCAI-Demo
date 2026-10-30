import React from 'react';
import { useLocation } from 'react-router-dom';
import CourseSheet from '../course/CourseSheet';
import EventPopup from '../events/EventPopup';
import PlaceSheet from '../map/PlaceSheet';
import usePopupAsk from '../../hooks/usePopupAsk';
import { useSchool, useStartPlace } from '../../modules/campus';
import { SheetDialog } from '../../modules/sheet';
import {
  COURSE_PARAM, EVENT_PARAM, PLACE_PARAM, popupSeed, useCloseOnce, useCloseParam, useOpenEvent,
} from '../../utils/openCourse';

/**
 * Which pop-up the location asks for. With more than one parameter the
 * newest wins: a place card opens events, so `?event=` sits above `?place=`,
 * and a course sits above both. The map draws its own place card, so
 * `?place=` opens nothing there.
 */
export function popupFor(location) {
  const params = new URLSearchParams(location?.search || '');
  const value = (name) => (params.get(name) || '').trim();
  if (value(COURSE_PARAM)) return { kind: 'course', param: COURSE_PARAM, id: value(COURSE_PARAM) };
  if (value(EVENT_PARAM)) return { kind: 'event', param: EVENT_PARAM, id: value(EVENT_PARAM) };
  if (value(PLACE_PARAM) && location?.pathname !== '/map') {
    return { kind: 'place', param: PLACE_PARAM, id: value(PLACE_PARAM) };
  }
  return null;
}

/** Event and place pop-ups: walks from the shared start place, times in the school's zone. */
function CampusSheet({
  kind, id, seed, onAsk, onClose, titleId,
}) {
  const openEvent = useOpenEvent();
  const start = useStartPlace();
  const { timezone } = useSchool();
  const Body = kind === 'event' ? EventPopup : PlaceSheet;
  const props = kind === 'event' ? { eventId: id, event: seed } : { placeId: id, place: seed };
  return (
    <Body
      {...props}
      from={start.id || undefined}
      timezone={timezone || undefined}
      onAsk={onAsk}
      onClose={onClose}
      onOpenEvent={openEvent}
      titleId={titleId}
    />
  );
}

const SIZE = { course: 'course', event: 'medium', place: 'narrow' };
const TITLE_ID = { course: 'course-popup-title', event: 'event-popup-title', place: 'place-popup-title' };

/**
 * The shell's one pop-up host: reads `?course=`, `?event=` and `?place=` on
 * any signed-in page and shows that pop-up in one band sheet dialog over the
 * page column, so the rail and the chat dock stay live (eng R8, R15, D3;
 * plan R1). Close, Escape and the scrim remove the parameter; Back does too.
 */
export default function PopupHost() {
  const location = useLocation();
  const open = popupFor(location);
  const param = open?.param || COURSE_PARAM;
  const value = open?.id || '';
  const close = useCloseOnce(value, useCloseParam(param));
  const ask = usePopupAsk(value, close);

  if (!open) return null;
  const titleId = TITLE_ID[open.kind];
  const body = open.kind === 'course'
    ? <CourseSheet courseId={open.id} onClose={close} titleId={titleId} />
    : (
      <CampusSheet
        kind={open.kind}
        id={open.id}
        seed={popupSeed(location, open.id)}
        onAsk={ask}
        onClose={close}
        titleId={titleId}
      />
    );

  return (
    <SheetDialog onClose={close} labelledBy={titleId} size={SIZE[open.kind]}>
      {body}
    </SheetDialog>
  );
}
