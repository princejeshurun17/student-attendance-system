import streamlit as st
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
from datetime import datetime, time, timedelta

# ==========================================
# CONFIGURATION
# ==========================================
st.set_page_config(page_title="RFID Attendance Dashboard", layout="wide", page_icon="🎓")

# --------------------------------------------------------
# IMPORTANT: REPLACE THESE URLs WITH YOUR OWN PUBLISHED CSV LINKS
# 1. In Google Sheet: "File" > "Share" > "Publish to web"
# 2. Select "StudentRegistry" > "Comma-separated values (.csv)" > Publish > Copy Link
REGISTRY_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQ-BfoVhIFuUW3hYbN-6BcW0QBygB761GU9lle7BmHC9CztbAp9rkM5LJ6ZVJkrbY-3UIizYbW9krds/pub?gid=868486306&single=true&output=csv"

# 3. Select "AttendanceLog" > "Comma-separated values (.csv)" > Publish > Copy Link
LOG_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQ-BfoVhIFuUW3hYbN-6BcW0QBygB761GU9lle7BmHC9CztbAp9rkM5LJ6ZVJkrbY-3UIizYbW9krds/pub?gid=1791813027&single=true&output=csv"
# --------------------------------------------------------

# Fallback mock data if URLs are not set
def load_mock_data():
    st.warning("Using MOCK data. Please update `REGISTRY_URL` and `LOG_URL` in `dashboard.py` with your published sheet links.")
    
    # Mock Registry
    reg_df = pd.DataFrame({
        "UID": ["A1", "A2", "A3", "A4", "A5"],
        "Name": ["Ali", "Siti", "Ah Hock", "Muthu", "Jessica"],
        "Student ID": ["2101", "2102", "2103", "2104", "2105"],
        "Class/Section": ["CS301-A", "CS301-A", "CS301-B", "CS302-A", "CS302-A"]
    })
    
    # Mock Logs
    dates = pd.date_range(end=datetime.now(), periods=50).tolist() * 2
    logs_df = pd.DataFrame({
        "Timestamp": dates,
        "UID": ["A1"]*20 + ["A2"]*20 + ["A3"]*20 + ["A4"]*20 + ["A5"]*20,
        "WiFi RSSI": [-60 + i%10 for i in range(100)],
        "Free Heap": [200000 - i*100 for i in range(100)]
    })
    logs_df["Date"] = logs_df["Timestamp"].dt.date
    logs_df["Time"] = logs_df["Timestamp"].dt.time
    return reg_df, logs_df

@st.cache_data(ttl=60)  # Cache for 1 min
def load_data():
    try:
        # Check if URLs are placeholders
        if "REPLACE_ME" in REGISTRY_URL or "REPLACE_ME" in LOG_URL:
            return load_mock_data()
            
        reg_df = pd.read_csv(REGISTRY_URL)
        logs_df = pd.read_csv(LOG_URL)
        
        # Cleanup column names (strip spaces)
        reg_df.columns = reg_df.columns.str.strip()
        logs_df.columns = logs_df.columns.str.strip()
        
        # Convert timestamps
        logs_df["Timestamp"] = pd.to_datetime(logs_df["Timestamp"])
        # Ensure we have Date/Time columns if missing (published CSV might differ from internal ranges)
        if "Date" not in logs_df.columns:
            logs_df["Date"] = logs_df["Timestamp"].dt.date
        else:
             logs_df["Date"] = pd.to_datetime(logs_df["Date"]).dt.date
             
        if "Time" not in logs_df.columns:
             logs_df["Time"] = logs_df["Timestamp"].dt.time
        else:
             # handle string time conversion
             logs_df["Time"] = pd.to_datetime(logs_df["Time"].astype(str), format='%H:%M:%S').dt.time

        # Force numeric metrics (coercing errors to NaN)
        if "WiFi RSSI" in logs_df.columns:
            logs_df["WiFi RSSI"] = pd.to_numeric(logs_df["WiFi RSSI"], errors='coerce')
        if "Free Heap" in logs_df.columns:
             logs_df["Free Heap"] = pd.to_numeric(logs_df["Free Heap"], errors='coerce')

        # Validate Columns
        required_reg = ["UID", "Name"]
        if not all(col in reg_df.columns for col in required_reg):
            raise ValueError(f"Registry CSV missing columns: {required_reg}. Found: {list(reg_df.columns)}")
            
        required_log = ["UID"]
        if not all(col in logs_df.columns for col in required_log):
             raise ValueError(f"attendance CSV missing columns: {required_log}. Found: {list(logs_df.columns)}")

        return reg_df, logs_df
    except Exception as e:
        st.error(f"⚠️ Error loading data. Did you 'Publish to Web' as CSV? \n\nDetails: {e}")
        return load_mock_data()

# Helper for Signal Quality
def get_signal_quality(rssi):
    if pd.isna(rssi): return "Unknown"
    if rssi >= -55: return "Excellent 🟢"
    if rssi >= -65: return "Good 🟡"
    if rssi >= -75: return "Fair 🟠"
    return "Poor 🔴"

# ==========================================
# MAIN APP
# ==========================================

# 1. Load Data
reg_df, logs_df = load_data()

# Merge Name/Class into Logs for easier analysis
if "Name" in logs_df.columns:
    logs_df = logs_df.drop(columns=["Name"])
    
full_df = logs_df.merge(reg_df, on="UID", how="left")
full_df["Name"] = full_df["Name"].fillna("Unknown")
full_df["Class/Section"] = full_df["Class/Section"].fillna("Unregistered")

# 2. Sidebar Filters
st.sidebar.title("Filters")

# Date Filter
min_date = full_df["Date"].min()
max_date = full_df["Date"].max()
date_range = st.sidebar.date_input("Select Date Range", [min_date, max_date], min_value=min_date, max_value=max_date)

if len(date_range) == 2:
    start_d, end_d = date_range
    mask = (full_df["Date"] >= start_d) & (full_df["Date"] <= end_d)
    filtered_df = full_df[mask]
else:
    filtered_df = full_df

# Class Filter
all_classes = sorted(full_df["Class/Section"].unique())
selected_classes = st.sidebar.multiselect("Select Class/Section", all_classes, default=all_classes)
if selected_classes:
    filtered_df = filtered_df[filtered_df["Class/Section"].isin(selected_classes)]

# 3. KPI Metrics
st.title("🎓 RFID Attendance Dashboard")
st.markdown("Real-time tracking of student attendance via ESP32")

col1, col2, col3, col4 = st.columns(4)

total_checks = len(filtered_df)
unique_students = filtered_df["UID"].nunique()
avg_rssi = filtered_df["WiFi RSSI"].mean()
signal_quality = get_signal_quality(avg_rssi)

# Late Arrivals (after 8:30 AM)
cutoff_time = time(8, 30, 0)
late_count = len(filtered_df[filtered_df["Time"] > cutoff_time])

col1.metric("Total Check-ins", total_checks)
col2.metric("Unique Students", unique_students)
col3.metric("Late Arrivals (>8:30)", late_count, delta=-late_count, delta_color="inverse")
col4.metric("Avg Signal", f"{signal_quality} ({avg_rssi:.0f} dBm)")

st.markdown("---")

# 4. Charts Layout

# Row 1: Timeline & Heatmap
c1, c2 = st.columns([2, 1])

with c1:
    st.subheader("Attendance Over Time")
    # Group by Date
    daily_counts = filtered_df.groupby("Date").size().reset_index(name="Count")
    fig_line = px.line(daily_counts, x="Date", y="Count", markers=True, title="Daily Check-in Volume")
    fig_line.update_layout(xaxis_title="Date", yaxis_title="Students")
    st.plotly_chart(fig_line, use_container_width=True)

with c2:
    st.subheader("Busiest Hours")
    filtered_df["Hour"] = filtered_df["Timestamp"].dt.hour
    hourly_counts = filtered_df.groupby("Hour").size().reset_index(name="Count")
    fig_bar = px.bar(hourly_counts, x="Hour", y="Count", title="Hourly Distribution", color="Count")
    st.plotly_chart(fig_bar, use_container_width=True)

# Row 2: Student Leaderboard & Class Distribution
c3, c4 = st.columns([2, 1])

with c3:
    st.subheader("Top Attendees")
    top_students = filtered_df["Name"].value_counts().reset_index()
    top_students.columns = ["Name", "Check-ins"]
    fig_hbar = px.bar(top_students.head(10), x="Check-ins", y="Name", orientation='h', title="Most frequent scans")
    fig_hbar.update_layout(yaxis={'categoryorder':'total ascending'})
    st.plotly_chart(fig_hbar, use_container_width=True)

with c4:
    st.subheader("By Class")
    class_dist = filtered_df["Class/Section"].value_counts().reset_index()
    class_dist.columns = ["Class", "Count"]
    fig_pie = px.pie(class_dist, values="Count", names="Class", title="Distribution by Section", hole=0.4)
    st.plotly_chart(fig_pie, use_container_width=True)

# Row 3: Late Arrivals Table
st.markdown("---")
st.subheader("⚠️ Late Arrivals Report (After 8:30 AM)")
late_df = filtered_df[filtered_df["Time"] > cutoff_time][["Date", "Time", "Name", "Class/Section", "UID"]].sort_values("Time", ascending=False)
st.dataframe(late_df, use_container_width=True)

# Row 4: Device Health
with st.expander("📡 Device Health Diagnostics", expanded=True):
    h1, h2 = st.columns(2)
    # Resample for less noise if lots of data
    if len(filtered_df) > 200:
        # Select only numeric columns for mean aggregation
        numeric_cols = ["WiFi RSSI"]
        if "Free Heap" in filtered_df.columns:
            numeric_cols.append("Free Heap")
            
        # Resample to hourly mean, then drop NaNs to avoid gaps in the line chart
        resampled = filtered_df.set_index("Timestamp")[numeric_cols].resample("1H").mean().dropna().reset_index()
    else:
        resampled = filtered_df
        
    fig_rssi = px.line(resampled, x="Timestamp", y="WiFi RSSI", title="WiFi Signal Strength Trend")
    fig_rssi.update_traces(connectgaps=True) # Connect lines across missing data
    h1.plotly_chart(fig_rssi, use_container_width=True)
    
    if "Free Heap" in resampled.columns:
        fig_heap = px.line(resampled, x="Timestamp", y="Free Heap", title="Device Memory (Free Heap)")
        fig_heap.update_traces(connectgaps=True)
        h2.plotly_chart(fig_heap, use_container_width=True)
