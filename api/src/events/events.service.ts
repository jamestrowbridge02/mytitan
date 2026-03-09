import { Injectable } from @nestjs/common;
import { Subject } from rxjs;

@Injectable()
export class EventsService {
  private readonly stream = new Subject<any>();

  emit(event: any) {
    this.stream.next(event);
  }

  asObservable() {
    return this.stream.asObservable();
  }
}
