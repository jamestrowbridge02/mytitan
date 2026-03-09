import { Controller, Sse } from @nestjs/common;
import { map, Observable } from rxjs;
import { EventsService } from ./events.service;

@Controller('events')
export class EventsController {
  constructor(private readonly events: EventsService) {}

  @Sse('command-centre')
  commandCentre(): Observable<MessageEvent> {
    return this.events.asObservable().pipe(
      map((payload) => ({
        data: payload,
      }) as MessageEvent),
    );
  }
}
