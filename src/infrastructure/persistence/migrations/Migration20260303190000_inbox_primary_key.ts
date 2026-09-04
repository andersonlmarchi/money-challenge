import { Migration } from '@mikro-orm/migrations';

export class Migration20260303190000_inbox_primary_key extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      ALTER TABLE inbox_messages
      ADD CONSTRAINT inbox_messages_pkey PRIMARY KEY (consumer_name, message_id);
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`
      ALTER TABLE inbox_messages DROP CONSTRAINT IF EXISTS inbox_messages_pkey;
    `);
  }
}
