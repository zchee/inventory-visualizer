import { Component, Injectable, OnInit } from '@angular/core';
import { ApiService } from './api.service';
import {
  SegmentedTimelineDataResponse,
  SegmentData,
  SegmentedTimelineCompareResponse,
  SegmentedDataErrorResponse
} from './proto/protobuf/data';
import { Subject } from 'rxjs';
import {
  NgbModal,
  NgbDateStruct,
  NgbDateAdapter,
} from '@ng-bootstrap/ng-bootstrap';

/**
 * This Service handles how the date is represented in scripts i.e. ngModel.
 */
@Injectable()
export class CustomAdapter extends NgbDateAdapter<string> {
  readonly DELIMITER = '-';

  fromModel(value: string | null): NgbDateStruct | null {
    if (value) {
      const date = value.split(this.DELIMITER);
      return {
        day: parseInt(date[1], 10),
        month: parseInt(date[0], 10),
        year: parseInt(date[2], 10),
      };
    }
    return null;
  }

  toModel(date: NgbDateStruct | null): string | null {
    return date
      ? date.month + this.DELIMITER + date.day + this.DELIMITER + date.year
      : null;
  }
}

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css'],
  providers: [{ provide: NgbDateAdapter, useClass: CustomAdapter }],
})
export class AppComponent implements OnInit {
  title = 'Inventory Visualizer';
  dataResponse: SegmentedTimelineDataResponse;
  data: Array<any[]>;
  segments: SegmentData[];
  page: number;

  updateCharts: Subject<any> = new Subject();
  compareData: Subject<any> = new Subject();
  errorData: Subject<any> = new Subject();
  clearCharts: Subject<any> = new Subject();
  updateFilters: Subject<any> = new Subject();

  files: string[];
  hasDisplayedData: boolean;

  filtered: boolean;
  filters: {
    device: string;
    countries: string[];
    fromDate: string;
    toDate: string;
    timePeriod: string;
  };
  fromDate: string;
  toDate: string;
  countries = [];
  devices = [];
  timePeriods = [
    { id: 'day', name: 'Daily' },
    { id: 'week', name: 'Weekly' },
    { id: 'month', name: 'Monthly' },
  ];
  selectedDeviceId: string;
  selectedTimePeriodId: string;
  selectedCountryIds: string[];

  constructor(private api: ApiService, private modalService: NgbModal) {
    this.segments = [];
    this.files = [];
    this.page = 0;
    this.hasDisplayedData = false;
    this.filtered = false;
    this.filters = {
      device: null,
      countries: [],
      fromDate: null,
      toDate: null,
      timePeriod: null,
    };
  }

  ngOnInit(): void {
    const username = this.generateRandomString(15);
    this.api.registerUser(username).subscribe((res) => {
      localStorage.setItem('token', res.token);
    });
  }

  generateRandomString(length: number): string {
    let text = '';
    const possible =
      'ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890abcdefghijklmnopqrstuvwxyz';
    for (let i = 0; i < length; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
  }

  openFilterModal(content): void {
    this.modalService
      .open(content, { ariaLabelledBy: 'modal-basic-title' })
      .result.then(
        (result) => {
          this.filtered = true;
          this.saveFilters();
          this.page = 0;
          this.clearChild(true);
          this.sendFiltersToChild(this.filters);
          if (this.files.length === 1) {
            this.getData();
          } else {
            this.getErrorMetricsData();
          }
        },
        (reason) => {
          this.filtered = false;
          this.discardFilters();
        }
      );
  }

  scrollHandler(): void {
    this.page += 1;
    if (this.files.length === 1) {
      this.getData();
    } else {
      this.getComparisonData();
    }
  }

  public handleFileInput(files: FileList): void {
    this.files.push(files[0].name);
    this.uploadFile(files);
  }

  public handleComparisonInput(files: FileList): void {
    this.clearChild(true);
    this.page = 0;
    this.files.push(files[0].name);
    this.api.uploadFile(files).subscribe((response) => {
      localStorage.setItem('token', response.token);
      this.files[1] = response.filename;
      this.getErrorMetricsData();
    });
  }

  public uploadFile(file): void {
    this.api.uploadFile(file).subscribe((response) => {
      localStorage.setItem('token', response.token);
      this.files[0] = response.filename;
      this.getData();
    });
  }

  signalChildForChartUpdates(changes): void {
    this.updateCharts.next(changes);
  }

  triggerChildComparison(changes): void {
    this.compareData.next(changes);
  }

  giveErrorDataToChild(changes): void {
    this.errorData.next(changes);
  }

  clearChild(changes): void {
    this.clearCharts.next(changes);
  }

  sendFiltersToChild(changes): void {
    this.updateFilters.next(changes);
  }

  getData(): void {
    this.api
      .getSegmentedData(this.files[0], this.page, 8, this.filters)
      .subscribe((res) => {
        this.dataResponse = SegmentedTimelineDataResponse.fromJSON(res);
        this.countries = this.dataResponse.countries;
        this.devices = this.dataResponse.devices;
        this.segments = [];
        this.dataResponse.data.forEach((item) => this.segments.push(item));
        this.signalChildForChartUpdates(this.segments);
        this.hasDisplayedData = true;
      });
  }

  getComparisonData(): void {
    this.api
      .getComparisonData(
        this.files[0],
        this.files[1],
        this.page,
        8,
        this.filters
      )
      .subscribe((res) => {
        const compareResponse = SegmentedTimelineCompareResponse.fromJSON(res);
        this.triggerChildComparison(compareResponse);
        this.hasDisplayedData = true;
      });
  }

  getErrorMetricsData(): void {
    this.api
      .getErrorMetricsData(this.files[0], this.files[1], this.filters)
      .subscribe((res) => {
        const compareResponse = SegmentedDataErrorResponse.fromJSON(res);
        this.giveErrorDataToChild(compareResponse);
        this.getComparisonData();
      });
  }

  saveFilters(): void {
    this.filters.device = this.selectedDeviceId;
    this.filters.countries = this.selectedCountryIds;
    this.filters.toDate = this.toDate;
    this.filters.fromDate = this.fromDate;
    this.filters.timePeriod = this.selectedTimePeriodId;
  }

  discardFilters(): void {
    this.selectedDeviceId = this.filters.device;
    this.selectedCountryIds = this.filters.countries;
    this.fromDate = this.filters.fromDate;
    this.toDate = this.filters.toDate;
    this.selectedTimePeriodId = this.filters.timePeriod;
  }
}
