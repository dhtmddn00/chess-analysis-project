#!/usr/bin/env python3
"""
Database migration utility for Chess Analysis Service
Supports both SQLite (legacy) and PostgreSQL (microservices)
"""

import os
import sys
import asyncio
import asyncpg
import sqlite3
import json
from datetime import datetime
from typing import Dict, Any, List, Optional
import argparse
from loguru import logger

# Database connection configurations
POSTGRES_CONFIG = {
    'host': os.getenv('POSTGRES_HOST', 'localhost'),
    'port': int(os.getenv('POSTGRES_PORT', 5432)),
    'database': os.getenv('POSTGRES_DB', 'chess_analysis'),
    'user': os.getenv('POSTGRES_USER', 'chess_user'),
    'password': os.getenv('POSTGRES_PASSWORD', 'chess_password')
}

SQLITE_PATH = os.getenv('SQLITE_PATH', 'chess_analysis.db')


class DatabaseMigrator:
    """Handle database migrations between SQLite and PostgreSQL"""
    
    def __init__(self):
        self.postgres_pool = None
        self.sqlite_conn = None
    
    async def connect_postgres(self) -> bool:
        """Connect to PostgreSQL database"""
        try:
            self.postgres_pool = await asyncpg.create_pool(
                host=POSTGRES_CONFIG['host'],
                port=POSTGRES_CONFIG['port'],
                database=POSTGRES_CONFIG['database'],
                user=POSTGRES_CONFIG['user'],
                password=POSTGRES_CONFIG['password'],
                min_size=1,
                max_size=5,
                command_timeout=30
            )
            logger.info("Connected to PostgreSQL successfully")
            return True
        except Exception as e:
            logger.error(f"Failed to connect to PostgreSQL: {e}")
            return False
    
    def connect_sqlite(self) -> bool:
        """Connect to SQLite database"""
        try:
            if os.path.exists(SQLITE_PATH):
                self.sqlite_conn = sqlite3.connect(SQLITE_PATH)
                self.sqlite_conn.row_factory = sqlite3.Row
                logger.info(f"Connected to SQLite: {SQLITE_PATH}")
                return True
            else:
                logger.warning(f"SQLite database not found: {SQLITE_PATH}")
                return False
        except Exception as e:
            logger.error(f"Failed to connect to SQLite: {e}")
            return False
    
    async def check_postgres_connection(self) -> bool:
        """Check if PostgreSQL is accessible"""
        try:
            async with self.postgres_pool.acquire() as conn:
                await conn.fetchval("SELECT 1")
                return True
        except Exception as e:
            logger.error(f"PostgreSQL connection check failed: {e}")
            return False
    
    async def run_sql_scripts(self, script_dir: str) -> bool:
        """Run SQL scripts from directory in order"""
        try:
            script_files = sorted([f for f in os.listdir(script_dir) if f.endswith('.sql')])
            
            for script_file in script_files:
                script_path = os.path.join(script_dir, script_file)
                logger.info(f"Executing script: {script_file}")
                
                with open(script_path, 'r', encoding='utf-8') as f:
                    sql_content = f.read()
                
                async with self.postgres_pool.acquire() as conn:
                    try:
                        await conn.execute(sql_content)
                        logger.info(f"✓ {script_file} executed successfully")
                    except Exception as e:
                        logger.error(f"✗ Failed to execute {script_file}: {e}")
                        return False
            
            return True
        except Exception as e:
            logger.error(f"Failed to run SQL scripts: {e}")
            return False
    
    async def migrate_data_from_sqlite(self) -> bool:
        """Migrate existing data from SQLite to PostgreSQL"""
        if not self.sqlite_conn:
            logger.info("No SQLite database to migrate from")
            return True
        
        try:
            # Get list of tables to migrate
            cursor = self.sqlite_conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
            )
            tables = [row[0] for row in cursor.fetchall()]
            logger.info(f"Found {len(tables)} tables to migrate: {tables}")
            
            async with self.postgres_pool.acquire() as conn:
                for table_name in tables:
                    await self._migrate_table(table_name, conn)
            
            logger.info("Data migration completed successfully")
            return True
            
        except Exception as e:
            logger.error(f"Data migration failed: {e}")
            return False
    
    async def _migrate_table(self, table_name: str, conn: asyncpg.Connection):
        """Migrate a single table from SQLite to PostgreSQL"""
        try:
            # Get data from SQLite
            cursor = self.sqlite_conn.execute(f"SELECT * FROM {table_name}")
            rows = cursor.fetchall()
            
            if not rows:
                logger.info(f"Table {table_name} is empty, skipping")
                return
            
            # Get column names
            column_names = [description[0] for description in cursor.description]
            
            # Convert SQLite rows to dictionaries
            data_rows = []
            for row in rows:
                row_dict = {}
                for i, col_name in enumerate(column_names):
                    value = row[i]
                    
                    # Handle datetime fields (SQLite stores as text, PostgreSQL needs datetime objects)
                    if col_name.endswith('_at') or col_name in ['joined_date', 'last_online', 'start_time', 'end_time', 'last_updated', 'executed_at']:
                        if value and isinstance(value, str):
                            try:
                                from datetime import datetime
                                # Handle various datetime formats
                                if 'T' in value:
                                    # ISO format with T separator
                                    if '+' in value or value.endswith('Z'):
                                        # With timezone
                                        dt = datetime.fromisoformat(value.replace('Z', '+00:00'))
                                    else:
                                        # Without timezone
                                        dt = datetime.fromisoformat(value)
                                else:
                                    # Standard format
                                    dt = datetime.strptime(value, '%Y-%m-%d %H:%M:%S')
                                row_dict[col_name] = dt
                            except:
                                row_dict[col_name] = None
                        else:
                            row_dict[col_name] = value
                    
                    # Handle JSON fields (SQLite stores as text, PostgreSQL as JSONB)
                    elif col_name.endswith('_percentiles') or col_name in [
                        'time_controls', 'style_scores', 'cohort_comparison', 
                        'key_insights', 'quick_tips', 'key_mistakes', 'time_analysis',
                        'overall_objectives', 'key_principles', 'avoid_habits',
                        'evidence', 'objectives', 'kpi_targets', 'instructions',
                        'resources', 'success_metrics', 'style_distributions'
                    ]:
                        if value and isinstance(value, str):
                            try:
                                # Parse JSON string to dict/list for PostgreSQL JSONB
                                parsed_json = json.loads(value)
                                row_dict[col_name] = parsed_json
                            except json.JSONDecodeError:
                                # If it's not valid JSON, treat as None
                                row_dict[col_name] = None
                        elif value is None:
                            row_dict[col_name] = None
                        else:
                            # Already a dict/list, pass as-is
                            row_dict[col_name] = value
                    
                    # Handle boolean fields (SQLite uses INTEGER, PostgreSQL uses BOOLEAN)
                    elif col_name in ['success', 'rated', 'is_check', 'is_capture', 'is_castling', 'is_promotion']:
                        if value is not None:
                            row_dict[col_name] = bool(value)
                        else:
                            row_dict[col_name] = value
                    
                    # Handle UUID fields (SQLite uses VARCHAR, PostgreSQL uses UUID)
                    elif col_name in ['id', 'analysis_id'] and table_name in ['analyses', 'game_analyses', 'improvement_plans']:
                        if value and isinstance(value, str) and len(value) == 36:
                            row_dict[col_name] = value
                        else:
                            row_dict[col_name] = value
                    
                    else:
                        row_dict[col_name] = value
                
                data_rows.append(row_dict)
            
            # Insert data into PostgreSQL
            if data_rows:
                # Build INSERT query
                placeholders = ', '.join([f'${i+1}' for i in range(len(column_names))])
                columns = ', '.join(column_names)
                
                insert_query = f"""
                    INSERT INTO {table_name} ({columns}) 
                    VALUES ({placeholders})
                    ON CONFLICT DO NOTHING
                """
                
                # Insert rows one by one to handle JSONB properly
                inserted_count = 0
                for row_dict in data_rows:
                    values = []
                    for col in column_names:
                        value = row_dict.get(col)
                        # Convert dict/list to JSON string for JSONB fields
                        if (col.endswith('_percentiles') or col in [
                            'time_controls', 'style_scores', 'cohort_comparison', 
                            'key_insights', 'quick_tips', 'key_mistakes', 'time_analysis',
                            'overall_objectives', 'key_principles', 'avoid_habits',
                            'evidence', 'objectives', 'kpi_targets', 'instructions',
                            'resources', 'success_metrics', 'style_distributions'
                        ]) and isinstance(value, (dict, list)):
                            values.append(json.dumps(value))
                        else:
                            values.append(value)
                    
                    try:
                        await conn.execute(insert_query, *values)
                        inserted_count += 1
                    except Exception as e:
                        logger.warning(f"Failed to insert row in {table_name}: {e}")
                        # Continue with other rows
                
                logger.info(f"✓ Migrated {inserted_count}/{len(data_rows)} rows to {table_name}")
            
        except Exception as e:
            logger.error(f"Failed to migrate table {table_name}: {e}")
            raise
    
    async def close_connections(self):
        """Close database connections"""
        if self.postgres_pool:
            await self.postgres_pool.close()
        
        if self.sqlite_conn:
            self.sqlite_conn.close()


async def main():
    """Main migration function"""
    parser = argparse.ArgumentParser(description='Chess Analysis Database Migration Tool')
    parser.add_argument('--init', action='store_true', help='Initialize PostgreSQL schema')
    parser.add_argument('--migrate', action='store_true', help='Migrate data from SQLite to PostgreSQL')
    parser.add_argument('--check', action='store_true', help='Check database connections')
    parser.add_argument('--scripts-dir', default='database/init', help='Directory containing SQL scripts')
    
    args = parser.parse_args()
    
    migrator = DatabaseMigrator()
    
    try:
        # Connect to databases
        postgres_connected = await migrator.connect_postgres()
        sqlite_connected = migrator.connect_sqlite()
        
        if args.check:
            logger.info("Checking database connections...")
            if postgres_connected:
                pg_ok = await migrator.check_postgres_connection()
                logger.info(f"PostgreSQL: {'✓ Connected' if pg_ok else '✗ Failed'}")
            else:
                logger.info("PostgreSQL: ✗ Not connected")
            
            logger.info(f"SQLite: {'✓ Connected' if sqlite_connected else '✗ Not found'}")
            return
        
        if not postgres_connected:
            logger.error("Cannot proceed without PostgreSQL connection")
            return
        
        if args.init:
            logger.info("Initializing PostgreSQL schema...")
            success = await migrator.run_sql_scripts(args.scripts_dir)
            if success:
                logger.info("✓ Schema initialization completed")
            else:
                logger.error("✗ Schema initialization failed")
                return
        
        if args.migrate:
            if not sqlite_connected:
                logger.info("No SQLite database found, skipping data migration")
            else:
                logger.info("Migrating data from SQLite to PostgreSQL...")
                success = await migrator.migrate_data_from_sqlite()
                if success:
                    logger.info("✓ Data migration completed")
                else:
                    logger.error("✗ Data migration failed")
                    return
        
        if not args.init and not args.migrate and not args.check:
            logger.info("Running full migration (init + migrate)...")
            
            # Initialize schema
            success = await migrator.run_sql_scripts(args.scripts_dir)
            if not success:
                logger.error("Schema initialization failed")
                return
            
            # Migrate data if SQLite exists
            if sqlite_connected:
                success = await migrator.migrate_data_from_sqlite()
                if not success:
                    logger.error("Data migration failed")
                    return
            
            logger.info("✓ Full migration completed successfully")
    
    finally:
        await migrator.close_connections()


if __name__ == "__main__":
    asyncio.run(main())