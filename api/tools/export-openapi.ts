import { NestFactory } from "@nestjs/core";
import { SwaggerModule, DocumentBuilder } from "@nestjs/swagger";
import { writeFileSync } from "fs";
import { AppModule } from "../src/app.module";

async function main() {
  const app = await NestFactory.create(AppModule, { logger: false });
  const config = new DocumentBuilder().setTitle("MyTitan").setVersion("1").build();
  const doc = SwaggerModule.createDocument(app, config);
  writeFileSync("/opt/mytitan/mytitan-system-check/api/openapi.json", JSON.stringify(doc, null, 2));
  await app.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
