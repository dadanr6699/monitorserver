#!/bin/bash

get_bar() {
    local percent=${1%.*}
    [ -z "$percent" ] && percent=0
    local filled=$(( (percent * 8) / 100 ))
    [ $filled -gt 8 ] && filled=8
    local empty=$(( 8 - filled ))
    local bar=""
    for ((i=0; i<filled; i++)); do bar+="#"; done
    for ((i=0; i<empty; i++)); do bar+="-"; done
    echo "$bar"
}

get_status() {
    local pct=${1%.*}
    if   [ "$pct" -ge 90 ]; then echo "!!"
    elif [ "$pct" -ge 70 ]; then echo "! "
    else echo "OK"; fi
}

os=$(grep -w PRETTY_NAME /etc/os-release | cut -d'"' -f2)
uptime_str=$(uptime -p | sed 's/up //')
ip_pub=$(curl -s --max-time 3 ifconfig.me 2>/dev/null || echo "N/A")
load_avg=$(uptime | awk -F'load average:' '{print $2}' | xargs)
proc_count=$(ps aux --no-headers | wc -l)

cpu_load=$(top -bn1 | grep 'Cpu(s)' | awk '{print $2+$4}' | cut -d. -f1)
[ -z "$cpu_load" ] && cpu_load=0
cpu_bar=$(get_bar "$cpu_load")
cpu_st=$(get_status "$cpu_load")

ram_total=$(free -m | awk '/Mem:/{print $2}')
ram_used=$(free -m | awk '/Mem:/{print $3}')
ram_pct=$(( ram_used * 100 / ram_total ))
ram_bar=$(get_bar "$ram_pct")
ram_st=$(get_status "$ram_pct")

disk_total=$(df -h / | awk 'NR==2{print $2}')
disk_used=$(df -h / | awk 'NR==2{print $3}')
disk_pct=$(df -h / | awk 'NR==2{print $5}' | tr -d '%')
disk_bar=$(get_bar "$disk_pct")
disk_st=$(get_status "$disk_pct")

net_iface="eth0"
rx_total=$(cat /sys/class/net/$net_iface/statistics/rx_bytes)
tx_total=$(cat /sys/class/net/$net_iface/statistics/tx_bytes)
rx_gb=$(echo "scale=2; $rx_total/1024/1024/1024" | bc)
tx_gb=$(echo "scale=2; $tx_total/1024/1024/1024" | bc)

rx_b1=$(cat /sys/class/net/$net_iface/statistics/rx_bytes)
tx_b1=$(cat /sys/class/net/$net_iface/statistics/tx_bytes)
sleep 1
rx_b2=$(cat /sys/class/net/$net_iface/statistics/rx_bytes)
tx_b2=$(cat /sys/class/net/$net_iface/statistics/tx_bytes)
rx_bps=$(( rx_b2 - rx_b1 ))
tx_bps=$(( tx_b2 - tx_b1 ))

fmt_spd() {
    local b=$1
    if [ $b -ge 1048576 ]; then echo "$(echo "scale=2;$b/1048576"|bc) MB/s"
    elif [ $b -ge 1024 ];   then echo "$(echo "scale=1;$b/1024"|bc) KB/s"
    else echo "${b} B/s"; fi
}

rx_spd=$(fmt_spd $rx_bps)
tx_spd=$(fmt_spd $tx_bps)

# FORMAT KOTAK PERSISI (Total 27 Karakter per baris)
# Pinggiran: +=========================+ (27 karakter)
# Konten:    | 1234567890123456789012345 | -> total 25 karakter di dalam
SEP="+=========================+"

row() {
    # Memotong string jika terlalu panjang agar tidak merusak kotak
    local val=$(echo "$1" | cut -c1-23)
    printf "| %-23s |\n" "$val"
}

row_label() {
    local label="$1"
    local val=$(echo "$2" | cut -c1-12)
    printf "| %-9s: %-12s |\n" "$label" "$val"
}

row_resource() {
    local name="$1"
    local status="$2"
    local bar="$3"
    local pct="$4"
    printf "| %-4s %-2s [%s] %3s%% |\n" "$name" "$status" "$bar" "$pct"
}

row_process() {
    local name=$(echo "$1" | cut -c1-13)
    local pct="$2"
    printf "|  %-14s %6s%% |\n" "$name" "$pct"
}

echo "$SEP"
row "  VPS  VITAL  MONITOR"
echo "$SEP"
row " SYSTEM INFO"
echo "$SEP"
row_label "OS" "$os"
row_label "IP" "$ip_pub"
row_label "Uptime" "$uptime_str"
row_label "Load" "$load_avg"
row_label "Proses" "$proc_count aktif"
echo "$SEP"
row " RESOURCE USAGE"
echo "$SEP"
row_resource "CPU" "$cpu_st" "$cpu_bar" "$cpu_load"
row_resource "RAM" "$ram_st" "$ram_bar" "$ram_pct"
row_resource "DISK" "$disk_st" "$disk_bar" "$disk_pct"
echo "$SEP"
row " NETWORK TRAFFIC"
echo "$SEP"
row_label "DL Speed" "$rx_spd"
row_label "UL Speed" "$tx_spd"
row_label "Total RX" "${rx_gb} GB"
row_label "Total TX" "${tx_gb} GB"
echo "$SEP"
row " TOP CPU PROCESS"
echo "$SEP"
ps -eo comm,%cpu --sort=-%cpu | awk 'NR>1 && NR<=4 {
    print $1, $2
}' | while read -r name pct; do
    row_process "$name" "$pct"
done
echo "$SEP"
