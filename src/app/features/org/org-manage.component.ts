import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal, viewChild, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Observable } from 'rxjs';

import { ApiResponse } from '../../core/models/api-response.model';
import { BranchListItem } from '../../core/models/master.model';
import { OrgChart, OrgNode, OrgNodeSaveRequest } from '../../core/models/org.model';
import { MasterService } from '../../core/services/master.service';
import { OrgService } from '../../core/services/org.service';
import { OrgChartComponent } from './org-chart.component';

/**
 * Where the administrator builds the hierarchy.
 *
 * <p>Only hand-made boxes are listed for editing. Teachers and receptionists appear
 * on the chart automatically and are changed on their own master screens — that is
 * what keeps a person hired next year on the chart without anybody coming back
 * here.</p>
 */
@Component({
  selector: 'app-org-manage',
  standalone: true,
  imports: [CommonModule, FormsModule, OrgChartComponent],
  templateUrl: './org-manage.component.html',
  styleUrl: './org-manage.component.scss'
})
export class OrgManageComponent implements OnInit {
  private readonly org = inject(OrgService);
  private readonly master = inject(MasterService);

  protected readonly chart = signal<OrgChart | null>(null);
  protected readonly allBranches = signal<BranchListItem[]>([]);
  protected readonly saving = signal(false);
  protected readonly message = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);

  /** The box being edited, or null while adding a new one. */
  protected readonly editingId = signal<number | null>(null);

  protected form: OrgNodeSaveRequest = OrgManageComponent.blank();

  /** Boxes somebody created. The automatic ones cannot be edited from here. */
  protected readonly manual = computed(() =>
    (this.chart()?.nodes ?? [])
      .filter(n => !n.isAutomatic)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.personName.localeCompare(b.personName)));

  /** How many people the chart is currently drawing without being told to. */
  protected readonly automaticCount = computed(() =>
    (this.chart()?.nodes ?? []).filter(n => n.isAutomatic).length);

  /**
   * Who a manual box can be linked to, so it stops also appearing on its own.
   *
   * <p>Built from the chart's own automatic entries -- exactly the people who
   * currently show up unlinked -- plus, when editing a box that is already
   * linked, that same person even though linking makes them drop out of the
   * automatic list. Without that addition the dropdown would forget who was
   * selected the moment you opened the box to change something else.</p>
   *
   * <p>This is the fix for "Joy Mondal showing twice": the underlying cause
   * every time is a hand-made box with nobody told it is the same person as an
   * entry the register already produces automatically. Picking that person
   * here removes the duplicate without deleting anything or losing the photo
   * and details already entered on the box.</p>
   */
  protected readonly linkChoices = computed(() => {
    const nodes = this.chart()?.nodes ?? [];
    const choices = nodes
      .filter(n => n.isAutomatic && n.staffType && n.staffId)
      .map(n => ({ staffType: n.staffType!, staffId: n.staffId!, personName: n.personName }));

    const current = this.form.staffType && this.form.staffId
      ? { staffType: this.form.staffType, staffId: this.form.staffId, personName: this.form.personName }
      : null;

    if (current && !choices.some(c => c.staffType === current.staffType && c.staffId === current.staffId)) {
      choices.push(current);
    }

    return choices.sort((a, b) => a.personName.localeCompare(b.personName));
  });

  /** Bound to the link picker: "" for unlinked, else "Type:Id". */
  protected get linkChoiceKey(): string {
    return this.form.staffType && this.form.staffId ? `${this.form.staffType}:${this.form.staffId}` : '';
  }

  protected set linkChoiceKey(value: string) {
    if (!value) {
      this.form.staffType = null;
      this.form.staffId = null;
      return;
    }

    const [staffType, staffIdText] = value.split(':');
    this.form.staffType = staffType;
    this.form.staffId = Number(staffIdText);
  }

  protected readonly defaultParentName = computed(() =>
    this.chart()?.nodes.find(n => n.isDefaultStaffParent)?.personName ?? null);

  /** The "How it will look" preview, so edits and photographs show up in it at once. */
  private readonly preview = viewChild(OrgChartComponent);

  private static blank(): OrgNodeSaveRequest {
    return {
      personName: '',
      designation: null,
      qualification: null,
      computerTraining: null,
      isTechnical: false,
      email: null,
      branches: [],
      isActive: true,
      sortOrder: 0,
      staffType: null,
      staffId: null,
      isDefaultStaffParent: false,
      parentIds: []
    };
  }

  ngOnInit(): void {
    this.reload();

    this.master.branches().subscribe({
      next: branches => this.allBranches.set(branches),
      // The tick-list simply stays empty; branch is not required to save a box.
      error: () => this.allBranches.set([])
    });
  }

  /** A person can belong to more than one branch, so this is a tick-list, not a field. */
  protected isBranch(name: string | undefined): boolean {
    return !!name && this.form.branches.includes(name);
  }

  protected toggleBranch(name: string | undefined, on: boolean): void {
    if (!name) return;

    this.form.branches = on
      ? [...this.form.branches, name]
      : this.form.branches.filter(b => b !== name);
  }

  protected reload(): void {
    this.org.chart().subscribe({
      next: chart => this.chart.set(chart),
      error: () => this.error.set('The chart could not be loaded.')
    });

    // The preview fetches its own copy, so it has to be told as well.
    this.preview()?.reload();
  }

  protected startAdd(): void {
    this.editingId.set(null);
    this.form = OrgManageComponent.blank();
    this.clearNotes();
  }

  protected startEdit(node: OrgNode): void {
    this.editingId.set(node.id);
    this.clearNotes();

    this.form = {
      personName: node.personName,
      designation: node.designation,
      qualification: node.qualification,
      computerTraining: node.computerTraining,
      isTechnical: node.isTechnical,
      email: node.email,
      branches: [...node.branches],
      isActive: node.isActive,
      sortOrder: node.sortOrder,
      staffType: node.staffType,
      staffId: node.staffId,
      isDefaultStaffParent: node.isDefaultStaffParent,
      parentIds: [...node.parentIds]
    };
  }

  /** The boxes this one may report to — anything except itself. */
  protected readonly parentChoices = computed(() =>
    this.manual().filter(n => n.id !== this.editingId()));

  /** Who a box currently sits under, so the list says it without opening the form. */
  protected parentNames(node: OrgNode): string {
    const byId = new Map((this.chart()?.nodes ?? []).map(n => [n.id, n.personName]));

    return node.parentIds
      .map(id => byId.get(id))
      .filter((name): name is string => !!name)
      .join(', ');
  }

  protected isParent(id: number): boolean {
    return this.form.parentIds.includes(id);
  }

  protected toggleParent(id: number, on: boolean): void {
    this.form.parentIds = on
      ? [...this.form.parentIds, id]
      : this.form.parentIds.filter(p => p !== id);
  }

  protected save(): void {
    if (!this.form.personName.trim()) {
      this.error.set('Enter the name for this box.');
      return;
    }

    this.saving.set(true);
    this.clearNotes();

    const id = this.editingId();

    /* Adding answers with the new id and editing with a plain true, so the two
       observables have different shapes. Widened here rather than at the service,
       where the specific type is worth having. */
    const request: Observable<ApiResponse<number | boolean>> =
      id === null ? this.org.create(this.form) : this.org.update(id, this.form);

    request.subscribe({
      next: response => {
        this.saving.set(false);

        if (response.success === false) {
          this.error.set(response.message ?? 'That could not be saved.');
          return;
        }

        this.message.set(id === null ? 'Added to the chart.' : 'Chart updated.');
        this.startAdd();
        this.reload();
      },
      error: err => {
        this.saving.set(false);
        this.error.set(err?.error?.message ?? 'That could not be saved.');
      }
    });
  }

  protected remove(node: OrgNode): void {
    if (!confirm(`Remove ${node.personName} from the chart?`)) return;

    this.clearNotes();

    this.org.remove(node.id).subscribe({
      next: response => {
        if (response.success === false) {
          this.error.set(response.message ?? 'That box could not be removed.');
          return;
        }

        this.message.set('Removed from the chart.');
        if (this.editingId() === node.id) this.startAdd();
        this.reload();
      },
      error: err =>
        this.error.set(err?.error?.message ?? 'That box could not be removed.')
    });
  }

  /**
   * The longest side a chart photograph is stored at.
   *
   * <p>The chart draws them at about 40 pixels and a profile at not much more, so
   * anything beyond this is bytes nobody sees. It matters more than it sounds: a
   * 3 MB photograph straight off a phone took so long to arrive that the card had
   * already fallen back to initials, which is what "the photo is not showing" turned
   * out to be.</p>
   */
  private static readonly maxPhotoEdge = 600;

  protected uploadPhoto(node: OrgNode, event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    this.clearNotes();

    // Shrunk here rather than on the server, which has no imaging library — and
    // this way the big file never leaves the machine it was chosen on.
    this.shrink(file).then(
      small => this.send(node, small, input),
      () => this.send(node, file, input));
  }

  /**
   * Redraws the chosen image no larger than {@link maxPhotoEdge} on its longest
   * side, keeping its shape.
   *
   * <p>Rejects if the file cannot be decoded — a PDF renamed to .jpg, say — and the
   * caller then sends the original so the server can give its own verdict rather
   * than this quietly deciding the upload has failed.</p>
   */
  private shrink(file: File): Promise<File> {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const image = new Image();

      image.onload = () => {
        URL.revokeObjectURL(url);

        const edge = OrgManageComponent.maxPhotoEdge;
        const scale = Math.min(1, edge / Math.max(image.width, image.height));

        // Already small enough: leave it exactly as it is rather than re-encoding
        // it and losing a little quality for nothing.
        if (scale === 1) {
          resolve(file);
          return;
        }

        const canvas = document.createElement('canvas');
        canvas.width = Math.round(image.width * scale);
        canvas.height = Math.round(image.height * scale);

        const context = canvas.getContext('2d');
        if (!context) {
          reject(new Error('No canvas context.'));
          return;
        }

        context.drawImage(image, 0, 0, canvas.width, canvas.height);

        canvas.toBlob(
          blob => blob
            ? resolve(new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg',
                { type: 'image/jpeg' }))
            : reject(new Error('Could not re-encode the image.')),
          'image/jpeg',
          0.85);
      };

      image.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('That file could not be read as an image.'));
      };

      image.src = url;
    });
  }

  private send(node: OrgNode, file: File, input: HTMLInputElement): void {
    this.org.uploadPhoto(node.id, file).subscribe({
      next: () => {
        this.message.set(`Photograph saved for ${node.personName}.`);
        input.value = '';
        this.reload();
      },
      error: err => {
        input.value = '';
        this.error.set(err?.error?.message ?? 'That photograph could not be saved.');
      }
    });
  }

  private clearNotes(): void {
    this.message.set(null);
    this.error.set(null);
  }
}
