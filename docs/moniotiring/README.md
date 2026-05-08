# Monitoring Provisioning (Grafana + Prometheus + Alertmanager)

## Scope
- Monitor the Flowerpil production server from a separate monitoring server via Tailscale.
- Provide copy-paste provisioning commands for the monitoring server and a minimal, non-disruptive exporter setup for the Flowerpil server.
- Include an HTTP-only NGINX reverse proxy placeholder for `prox.fpil.xyz`.

## Monitoring server provisioning script
Copy, edit placeholders at the top, then run on the monitoring server.

```bash
#!/usr/bin/env bash
set -euo pipefail

# Required placeholders
TS_AUTH_KEY="__REPLACE__"
FLOWERPIL_TS_IP="__REPLACE__" # Tailscale IP of the Flowerpil server
SLACK_WEBHOOK_URL="__REPLACE__"
SLACK_CHANNEL="#ops"
SLACK_USERNAME="flowerpil-monitor"
GRAFANA_ADMIN_PASSWORD="__REPLACE__"
ALERTMANAGER_USER="prometheus" # change to alertmanager if your distro uses a different user

# Base packages
apt-get update
apt-get install -y ca-certificates curl gnupg lsb-release nginx \
  prometheus prometheus-alertmanager prometheus-node-exporter

# Grafana repository + install
install -d -m 0755 /etc/apt/keyrings
curl -fsSL https://packages.grafana.com/gpg.key | gpg --dearmor -o /etc/apt/keyrings/grafana.gpg
echo "deb [signed-by=/etc/apt/keyrings/grafana.gpg] https://packages.grafana.com/oss/deb stable main" \
  > /etc/apt/sources.list.d/grafana.list
apt-get update
apt-get install -y grafana

# Tailscale
curl -fsSL https://tailscale.com/install.sh | sh
tailscale up --authkey "${TS_AUTH_KEY}" --accept-dns=false

# Prometheus configuration
install -d -m 0755 /etc/prometheus/rules
cat > /etc/prometheus/prometheus.yml <<'EOF'
global:
  scrape_interval: 15s
  evaluation_interval: 15s

rule_files:
  - /etc/prometheus/rules/recording_rules.yml
  - /etc/prometheus/rules/alert_rules.yml

alerting:
  alertmanagers:
    - static_configs:
        - targets: ['127.0.0.1:9093']

scrape_configs:
  - job_name: prometheus
    static_configs:
      - targets: ['127.0.0.1:9090']
  - job_name: monitoring-node
    static_configs:
      - targets: ['127.0.0.1:9100']
  - job_name: flowerpil-node
    static_configs:
      - targets: ['__FLOWERPIL_TS_IP__:9100']
EOF

cat > /etc/prometheus/rules/recording_rules.yml <<'EOF'
groups:
  - name: flowerpil-recording
    interval: 1m
    rules:
      - record: node:mem_used_pct
        expr: 1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)
      - record: node:cpu_usage
        expr: 1 - avg by (instance) (rate(node_cpu_seconds_total{mode="idle"}[5m]))
      - record: node:net_rx_rate
        expr: sum by (instance) (rate(node_network_receive_bytes_total{device!~"lo|tailscale.*"}[5m]))
      - record: node:net_tx_rate
        expr: sum by (instance) (rate(node_network_transmit_bytes_total{device!~"lo|tailscale.*"}[5m]))
      - record: node:net_total_rate
        expr: node:net_rx_rate + node:net_tx_rate
      - record: node:disk_read_rate
        expr: sum by (instance) (rate(node_disk_read_bytes_total[5m]))
      - record: node:disk_write_rate
        expr: sum by (instance) (rate(node_disk_written_bytes_total[5m]))
      - record: node:disk_io_rate
        expr: node:disk_read_rate + node:disk_write_rate
      - record: node:cpu_usage_baseline_7d
        expr: avg_over_time(node:cpu_usage[7d])
      - record: node:net_total_baseline_7d
        expr: avg_over_time(node:net_total_rate[7d])
      - record: node:disk_io_baseline_7d
        expr: avg_over_time(node:disk_io_rate[7d])
      - record: node:baseline_samples_7d
        expr: count_over_time(node:cpu_usage[7d])
EOF

cat > /etc/prometheus/rules/alert_rules.yml <<'EOF'
groups:
  - name: flowerpil-alerts
    rules:
      - alert: MemoryWarningHigh
        expr: node:mem_used_pct >= 0.50 and on(instance) (ssh_sessions == 0)
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "Memory usage warning"
          description: "Memory usage is {{ $value | humanizePercentage }} on {{ $labels.instance }} and no active SSH sessions."
      - alert: MemoryDangerHigh
        expr: node:mem_used_pct >= 0.80
        for: 5m
        labels:
          severity: danger
        annotations:
          summary: "Memory usage danger"
          description: "Memory usage is {{ $value | humanizePercentage }} on {{ $labels.instance }}."
      - alert: TrafficSpike
        expr: node:net_total_rate > (node:net_total_baseline_7d * 3) and on(instance) (count_over_time(node:net_total_rate[7d]) > 1000)
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Traffic spike"
          description: "Network throughput is {{ $value | humanize1024 }}B/s on {{ $labels.instance }}, above the 7d baseline."
      - alert: CPUAboveBaseline
        expr: node:cpu_usage > (node:cpu_usage_baseline_7d * 1.5) and on(instance) (count_over_time(node:cpu_usage[7d]) > 1000)
        for: 15m
        labels:
          severity: warning
        annotations:
          summary: "CPU above baseline"
          description: "CPU usage is {{ $value | humanizePercentage }} on {{ $labels.instance }}, above the 7d baseline."
      - alert: DiskIOAboveBaseline
        expr: node:disk_io_rate > (node:disk_io_baseline_7d * 2) and on(instance) (count_over_time(node:disk_io_rate[7d]) > 1000)
        for: 15m
        labels:
          severity: warning
        annotations:
          summary: "Disk IO above baseline"
          description: "Disk IO is {{ $value | humanize1024 }}B/s on {{ $labels.instance }}, above the 7d baseline."
EOF

# Alertmanager configuration
cat > /etc/alertmanager/alertmanager.yml <<'EOF'
global:
  resolve_timeout: 5m

route:
  receiver: slack-default
  group_by: ['alertname', 'instance']
  group_wait: 30s
  group_interval: 5m
  repeat_interval: 2h
  routes:
    - matchers:
        - severity="danger"
      receiver: slack-danger

receivers:
  - name: slack-default
    slack_configs:
      - api_url: "__SLACK_WEBHOOK_URL__"
        channel: "__SLACK_CHANNEL__"
        username: "__SLACK_USERNAME__"
        send_resolved: true
        title: '{{ .CommonLabels.alertname }}'
        text: '{{ .CommonAnnotations.summary }}\n{{ .CommonAnnotations.description }}'
  - name: slack-danger
    slack_configs:
      - api_url: "__SLACK_WEBHOOK_URL__"
        channel: "__SLACK_CHANNEL__"
        username: "__SLACK_USERNAME__"
        send_resolved: true
        title: '{{ .CommonLabels.alertname }}'
        text: '{{ .CommonAnnotations.summary }}\n{{ .CommonAnnotations.description }}'
EOF

sed -i "s|__FLOWERPIL_TS_IP__|${FLOWERPIL_TS_IP}|g" /etc/prometheus/prometheus.yml
sed -i "s|__SLACK_WEBHOOK_URL__|${SLACK_WEBHOOK_URL}|g" /etc/alertmanager/alertmanager.yml
sed -i "s|__SLACK_CHANNEL__|${SLACK_CHANNEL}|g" /etc/alertmanager/alertmanager.yml
sed -i "s|__SLACK_USERNAME__|${SLACK_USERNAME}|g" /etc/alertmanager/alertmanager.yml
chown "${ALERTMANAGER_USER}:${ALERTMANAGER_USER}" /etc/alertmanager/alertmanager.yml
chmod 0640 /etc/alertmanager/alertmanager.yml

# Grafana data source provisioning
install -d -m 0755 /etc/grafana/provisioning/datasources
cat > /etc/grafana/provisioning/datasources/prometheus.yml <<'EOF'
apiVersion: 1
datasources:
  - name: Prometheus
    type: prometheus
    access: proxy
    url: http://127.0.0.1:9090
    isDefault: true
EOF

# Grafana admin password
grafana-cli admin reset-admin-password "${GRAFANA_ADMIN_PASSWORD}" || true

# Enable services
systemctl enable --now prometheus prometheus-alertmanager grafana-server nginx prometheus-node-exporter
systemctl restart prometheus prometheus-alertmanager grafana-server nginx
```

## Flowerpil server exporter setup (non-disruptive)
This adds Node Exporter plus a lightweight SSH session metric via the textfile collector. It does not touch PM2.

```bash
#!/usr/bin/env bash
set -euo pipefail

apt-get update
apt-get install -y prometheus-node-exporter

# Ensure textfile collector path exists
install -d -m 0755 /var/lib/node_exporter/textfile_collector

# Set textfile collector path for node_exporter
cat > /etc/default/prometheus-node-exporter <<'EOF'
ARGS="--collector.textfile.directory=/var/lib/node_exporter/textfile_collector"
EOF

systemctl restart prometheus-node-exporter

# SSH sessions exporter
cat > /usr/local/bin/ssh_sessions_exporter.sh <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
count="$(who | wc -l | tr -d ' ')"
printf "ssh_sessions %s\n" "${count}" > /var/lib/node_exporter/textfile_collector/ssh_sessions.prom
EOF
chmod +x /usr/local/bin/ssh_sessions_exporter.sh

cat > /etc/systemd/system/ssh-sessions-exporter.service <<'EOF'
[Unit]
Description=Export active SSH sessions to node_exporter textfile collector

[Service]
Type=oneshot
ExecStart=/usr/local/bin/ssh_sessions_exporter.sh
EOF

cat > /etc/systemd/system/ssh-sessions-exporter.timer <<'EOF'
[Unit]
Description=Run SSH sessions exporter periodically

[Timer]
OnBootSec=1m
OnUnitActiveSec=1m

[Install]
WantedBy=timers.target
EOF

systemctl daemon-reload
systemctl enable --now ssh-sessions-exporter.timer
```

## Alerting behavior
- Warning memory threshold: `>= 50%` usage and no active SSH sessions.
- Danger memory threshold: `>= 80%` usage regardless of SSH sessions.
- Traffic spikes: alert when throughput is significantly above the 7d baseline, with a minimum baseline sample guard.
- Other resource warnings: CPU and disk IO above their 7d baselines.

## Grafana dashboards
Create a Grafana folder named `Flowerpil Ops` and import these dashboards:
- Node Exporter Full (ID 1860)
- Prometheus 2.0 Stats (ID 3662)

## NGINX reverse proxy placeholder (HTTP only)
Replace `__TAILSCALE_GRAFANA_IP__` and place on the server handling `prox.fpil.xyz`.

```nginx
server {
  listen 80;
  server_name prox.fpil.xyz;

  location / {
    proxy_pass http://__TAILSCALE_GRAFANA_IP__:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```
