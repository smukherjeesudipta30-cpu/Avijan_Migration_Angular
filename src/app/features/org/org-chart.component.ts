import { CommonModule } from '@angular/common';
import { Component, computed, inject, input, signal, OnInit, OnDestroy } from '@angular/core';

import { OrgChart, OrgNode } from '../../core/models/org.model';
import { OrgService } from '../../core/services/org.service';

/** One row of the drawing: everybody the same distance below the top. */
interface OrgLevel {
  depth: number;
  nodes: OrgNode[];
}

/**
 * The staff hierarchy, drawn.
 *
 * <p>Shown to everybody — staff on the dashboard, students on their own page — so it
 * takes no inputs beyond how much room it has. It fetches the chart itself rather
 * than being handed one, because the pages that show it have nothing else to do with
 * the hierarchy.</p>
 */
@Component({
  selector: 'app-org-chart',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './org-chart.component.html',
  styleUrl: './org-chart.component.scss'
})
export class OrgChartComponent implements OnInit, OnDestroy {
  private readonly org = inject(OrgService);

  /** Heading text. Blank hides it, for a page that has its own. */
  readonly heading = input('Institute Hierarchy');

  /** Branch to show alone. Blank shows every branch. */
  readonly branch = input<string | null>(null);

  /**
   * Whose hierarchy to draw.
   *
   * <p>'team' is the whole centre. 'mine' is the signed-in student's own line — the
   * owner, then the teachers they are actually assigned to — which is the question a
   * student is really asking, and which follows their record when the office changes
   * their teacher.</p>
   */
  readonly scope = input<'team' | 'mine'>('team');

  protected readonly chart = signal<OrgChart | null>(null);
  protected readonly loading = signal(true);
  protected readonly failed = signal(false);

  /** Which branches appear on the chart, for the filter buttons. */
  protected readonly branches = computed(() => {
    const names = new Set<string>();
    for (const node of this.chart()?.nodes ?? []) {
      for (const name of node.branches) names.add(name);
    }
    return [...names].sort();
  });

  protected readonly chosenBranch = signal<string | null>(null);

  /**
   * The chart arranged into rows.
   *
   * <p>A box's depth is the longest way down to it, not the shortest: Technical
   * Support answers to two people, and drawing it beside the higher of the two would
   * put it above somebody it reports to. Taking the longest path puts every box below
   * everyone above it.</p>
   */
  protected readonly levels = computed<OrgLevel[]>(() => {
    const chart = this.chart();
    if (!chart) return [];

    const byId = new Map(chart.nodes.map(n => [n.id, n]));
    const depths = new Map<number, number>();

    const depthOf = (id: number, seen: Set<number>): number => {
      if (depths.has(id)) return depths.get(id)!;

      // A loop is refused when the chart is edited, but a drawing that hangs is a
      // worse failure than one that is slightly wrong, so guard anyway.
      if (seen.has(id)) return 0;
      seen.add(id);

      const node = byId.get(id);
      const parents = (node?.parentIds ?? []).filter(p => byId.has(p));
      const depth = parents.length === 0
        ? 0
        : Math.max(...parents.map(p => depthOf(p, seen))) + 1;

      depths.set(id, depth);
      return depth;
    };

    const wanted = this.branch() ?? this.chosenBranch();

    const visible = chart.nodes.filter(n => {
      if (!n.isActive) return false;
      // A box with no branch — the owner, a function such as Technical Support —
      // belongs to the whole centre and stays on every branch's chart. Somebody who
      // works at two branches appears on both.
      if (!wanted || n.branches.length === 0) return true;
      return n.branches.includes(wanted);
    });

    const rows = new Map<number, OrgNode[]>();

    for (const node of visible) {
      const depth = depthOf(node.id, new Set());
      const row = rows.get(depth) ?? [];
      row.push(node);
      rows.set(depth, row);
    }

    return [...rows.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([depth, nodes]) => ({
        depth,
        nodes: nodes.sort((a, b) =>
          a.sortOrder - b.sortOrder || a.personName.localeCompare(b.personName))
      }));
  });

  ngOnInit(): void {
    this.reload();
  }

  /**
   * Re-fetches the chart and its photographs. Public so the admin screen can call
   * it after an upload — otherwise its "How it will look" preview keeps showing the
   * chart as it was when the page opened.
   */
  reload(): void {
    const source = this.scope() === 'mine' ? this.org.myTeachers() : this.org.chart();

    source.subscribe({
      next: chart => {
        this.chart.set(chart);
        this.loading.set(false);
        this.loadPhotos(chart);
      },
      error: () => {
        this.failed.set(true);
        this.loading.set(false);
      }
    });
  }

  /** Object URLs for the boxes that have a photograph, keyed by box id. */
  protected readonly photoUrls = signal<Map<number, string>>(new Map());

  protected photoUrl(node: OrgNode): string | null {
    return this.photoUrls().get(node.id) ?? null;
  }

  /**
   * Fetches the photographs for the boxes that have one.
   *
   * <p>Through HttpClient rather than an <c>&lt;img src&gt;</c>, so the bearer token
   * goes with the request — see the note on OrgService.photoBlob.</p>
   */
  private loadPhotos(chart: OrgChart): void {
    for (const node of chart.nodes) {
      if (!node.hasPhoto) continue;

      this.org.photoBlob(node.id).subscribe({
        next: blob => this.photoUrls.update(map => {
          const next = new Map(map);
          next.set(node.id, URL.createObjectURL(blob));
          return next;
        }),
        // A missing or unreadable photograph just leaves the initials in place.
        error: () => undefined
      });
    }
  }

  ngOnDestroy(): void {
    for (const url of this.photoUrls().values()) URL.revokeObjectURL(url);
  }

  /** The names above a box, so a reader can see the line without a drawn one. */
  protected parentNames(node: OrgNode): string {
    const byId = new Map((this.chart()?.nodes ?? []).map(n => [n.id, n.personName]));

    return node.parentIds
      .map(id => byId.get(id))
      .filter((name): name is string => !!name)
      .join(', ');
  }

  protected initials(name: string): string {
    return name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(part => part[0]!.toUpperCase())
      .join('');
  }

  protected chooseBranch(name: string | null): void {
    this.chosenBranch.set(name);
  }
}
