import sqlite3
conn = sqlite3.connect(":memory:")
conn.execute("PRAGMA foreign_keys = ON")
try:
    conn.execute("CREATE TABLE Employees (id int, name text, id int)")
except Exception as e:
    print("Err 1:", e)
try:
    conn.execute("CREATE TABLE Projects (id INTEGER, emp_id INTEGER, FOREIGN KEY (emp_id) REFERENCES Employees(id))")
    print("Table created successfully")
except Exception as e:
    print("Err 2:", e)
try:
    conn.execute("INSERT INTO Projects VALUES (1, 1)")
    print("Inserted successfully")
except Exception as e:
    print("Err 3:", e)
