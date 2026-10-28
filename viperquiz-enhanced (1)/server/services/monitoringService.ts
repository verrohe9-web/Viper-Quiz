import { getDb } from "../db";
import { roomHealthMetrics, systemIssues, systemAlerts, systemCredits, dashboardMetrics } from "../../drizzle/schema";
import { eq, desc, and, gte } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";

export interface RoomDiagnostics {
  roomCode: string;
  status: "healthy" | "warning" | "critical" | "crashed";
  playerCount: number;
  avgResponseTime: number;
  errorCount: number;
  issues: string[];
}

export interface SystemHealthReport {
  overallHealth: number; // 0-100
  activeRooms: number;
  totalPlayers: number;
  criticalIssues: number;
  warnings: number;
  recentIssues: any[];
}

export class MonitoringService {
  /**
   * Check health of a specific game room
   */
  static async checkRoomHealth(roomCode: string): Promise<RoomDiagnostics> {
    const db = await getDb();
    if (!db) return { roomCode, status: "healthy", playerCount: 0, avgResponseTime: 0, errorCount: 0, issues: [] };

    // Get room metrics from database
    const metrics = await db
      .select()
      .from(roomHealthMetrics)
      .where(eq(roomHealthMetrics.roomCode, roomCode))
      .orderBy(desc(roomHealthMetrics.createdAt))
      .limit(1);

    const latestMetric = metrics[0];

    if (!latestMetric) {
      return {
        roomCode,
        status: "healthy",
        playerCount: 0,
        avgResponseTime: 0,
        errorCount: 0,
        issues: [],
      };
    }

    // Determine status based on metrics
    let status: "healthy" | "warning" | "critical" | "crashed" = "healthy";
    const issues: string[] = [];

    if (latestMetric.status === "crashed") {
      status = "crashed";
      issues.push("Room has crashed");
    } else if (latestMetric.errorCount > 10) {
      status = "critical";
      issues.push(`High error count: ${latestMetric.errorCount}`);
    } else if (latestMetric.avgResponseTime > 5000) {
      status = "critical";
      issues.push(`High response time: ${latestMetric.avgResponseTime}ms`);
    } else if (latestMetric.errorCount > 5) {
      status = "warning";
      issues.push(`Moderate error count: ${latestMetric.errorCount}`);
    } else if (latestMetric.avgResponseTime > 2000) {
      status = "warning";
      issues.push(`Elevated response time: ${latestMetric.avgResponseTime}ms`);
    }

    return {
      roomCode,
      status,
      playerCount: latestMetric.playerCount,
      avgResponseTime: latestMetric.avgResponseTime,
      errorCount: latestMetric.errorCount,
      issues,
    };
  }

  /**
   * Detect issues in a game room
   */
  static async detectIssues(roomCode: string): Promise<void> {
    const db = await getDb();
    if (!db) return;
    const diagnostics = await this.checkRoomHealth(roomCode);

    // Check for critical issues
    if (diagnostics.status === "critical" || diagnostics.status === "crashed") {
      // Check if issue already exists
      const existingIssue = await db
        .select()
        .from(systemIssues)
        .where(
          and(
            eq(systemIssues.roomCode, roomCode),
            eq(systemIssues.status, "detected")
          )
        )
        .limit(1);

      if (existingIssue.length === 0) {
        // Create new issue
        const issueType = diagnostics.status === "crashed" ? "crash" : "timeout";
        const severity = diagnostics.status === "crashed" ? "critical" : "high";

        await db.insert(systemIssues).values({
          issueType: issueType as any,
          severity: severity as any,
          roomCode,
          description: `Room ${roomCode} detected with ${diagnostics.status} status. Issues: ${diagnostics.issues.join(", ")}`,
          status: "detected",
          autoRepairAttempted: 0,
          autoRepairSuccess: 0,
        });
      }
    }
  }

  /**
   * Record room health metrics
   */
  static async recordRoomMetrics(
    roomCode: string,
    playerCount: number,
    avgResponseTime: number,
    errorCount: number,
    status: "healthy" | "warning" | "critical" | "crashed" = "healthy"
  ): Promise<void> {
    const db = await getDb();
    if (!db) return;

    await db.insert(roomHealthMetrics).values({
      roomCode,
      playerCount,
      avgResponseTime,
      errorCount,
      status,
      lastHealthCheck: new Date(),
    });

    // Check for issues after recording metrics
    await this.detectIssues(roomCode);
  }

  /**
   * Get system health report
   */
  static async getSystemHealthReport(): Promise<SystemHealthReport> {
    const db = await getDb();
    if (!db) return { overallHealth: 0, activeRooms: 0, totalPlayers: 0, criticalIssues: 0, warnings: 0, recentIssues: [] };

    // Get all active rooms
    const activeRoomsData = await db
      .select()
      .from(roomHealthMetrics)
      .orderBy(desc(roomHealthMetrics.createdAt));

    const uniqueRooms = new Map();
    activeRoomsData.forEach((metric) => {
      if (!uniqueRooms.has(metric.roomCode)) {
        uniqueRooms.set(metric.roomCode, metric);
      }
    });

    const activeRooms = uniqueRooms.size;
    let totalPlayers = 0;
    let criticalCount = 0;
    let warningCount = 0;

    uniqueRooms.forEach((metric) => {
      totalPlayers += metric.playerCount;
      if (metric.status === "critical" || metric.status === "crashed") {
        criticalCount++;
      } else if (metric.status === "warning") {
        warningCount++;
      }
    });

    // Get recent issues
    const recentIssues = await db
      .select()
      .from(systemIssues)
      .where(eq(systemIssues.status, "detected"))
      .orderBy(desc(systemIssues.createdAt))
      .limit(10);

    // Calculate overall health
    const overallHealth = Math.max(
      0,
      100 - criticalCount * 20 - warningCount * 10
    );

    return {
      overallHealth,
      activeRooms,
      totalPlayers,
      criticalIssues: criticalCount,
      warnings: warningCount,
      recentIssues,
    };
  }

  /**
   * Create system alert for an issue
   */
  static async createAlert(
    issueId: number,
    alertType:
      | "auto_repair_triggered"
      | "manual_intervention_needed"
      | "deployment_started"
      | "deployment_completed"
      | "deployment_failed",
    message: string,
    creditsUsed: number = 0
  ): Promise<void> {
    const db = await getDb();
    if (!db) return;

    await db.insert(systemAlerts).values({
      issueId,
      alertType,
      message,
      creditsUsed,
    });
  }

  /**
   * Check available credits
   */
  static async getAvailableCredits(): Promise<number> {
    const db = await getDb();
    if (!db) return 0;

    const credits = await db
      .select()
      .from(systemCredits)
      .limit(1);

    return credits[0]?.remainingCredits || 0;
  }

  /**
   * Deduct credits for repair
   */
  static async deductCredits(amount: number): Promise<boolean> {
    const db = await getDb();
    if (!db) return false;

    const available = await this.getAvailableCredits();
    if (available < amount) {
      return false;
    }

    const current = await db
      .select()
      .from(systemCredits)
      .limit(1);

    if (current.length > 0) {
      await db
        .update(systemCredits)
        .set({
          usedCredits: current[0].usedCredits + amount,
          remainingCredits: current[0].remainingCredits - amount,
        })
        .where(eq(systemCredits.id, current[0].id));
    }

    return true;
  }

  /**
   * Update dashboard metrics
   */
  static async updateDashboardMetrics(
    activeRooms: number,
    totalPlayers: number,
    issuesDetected: number,
    issuesFixed: number,
    avgSystemHealth: number,
    uptime: number
  ): Promise<void> {
    const db = await getDb();
    if (!db) return;

    // Get existing metrics
    const existing = await db
      .select()
      .from(dashboardMetrics)
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(dashboardMetrics)
        .set({
          activeRooms: activeRooms,
          totalPlayers: totalPlayers,
          issuesDetected: issuesDetected,
          issuesFixed: issuesFixed,
          avgSystemHealth: avgSystemHealth,
          uptime: uptime,
        })
        .where(eq(dashboardMetrics.id, existing[0].id));
    } else {
      await db.insert(dashboardMetrics).values({
        activeRooms,
        totalPlayers,
        issuesDetected,
        issuesFixed,
        avgSystemHealth,
        uptime,
      });
    }
  }

  /**
   * Get all detected issues
   */
  static async getDetectedIssues(limit: number = 20): Promise<any[]> {
    const db = await getDb();
    if (!db) return [];

    return await db
      .select()
      .from(systemIssues)
      .where(eq(systemIssues.status, "detected"))
      .orderBy(desc(systemIssues.createdAt))
      .limit(limit);
  }

  /**
   * Mark issue as fixed
   */
  static async markIssueAsFixed(issueId: number): Promise<void> {
    const db = await getDb();
    if (!db) return;

    await db
      .update(systemIssues)
      .set({
        status: "fixed" as any,
        resolvedAt: new Date(),
      })
      .where(eq(systemIssues.id, issueId));
  }
}
