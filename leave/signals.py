# leave/signals.py

from django.apps import apps
from django.db.models.signals import pre_delete, pre_save
from django.dispatch import receiver
from django.utils.translation import gettext_lazy as _

from horilla.methods import get_horilla_model_class
from leave.models import LeaveRequest

if apps.is_installed("attendance"):

    @receiver(pre_save, sender=LeaveRequest)
    def leaverequest_pre_save(sender, instance, **_kwargs):
        """
        Signal triggered before saving a LeaveRequest.
        Updates or creates WorkRecords for the leave period.
        """
        WorkRecords = get_horilla_model_class(
            app_label="attendance", model="workrecords"
        )

        # Ensure breakdown consistency if start_date == end_date
        if (
            instance.start_date == instance.end_date
            and instance.end_date_breakdown != instance.start_date_breakdown
        ):
            instance.end_date_breakdown = instance.start_date_breakdown

        period_dates = instance.requested_dates()

        if instance.status == "approved":
            # Create or update work records for approved leave
            for date in period_dates:
                work_entry = (
                    WorkRecords.objects.filter(
                        date=date,
                        employee_id=instance.employee_id,
                    ).first()
                    or WorkRecords()
                )

                work_entry.employee_id = instance.employee_id
                work_entry.is_leave_record = True
                work_entry.leave_request_id = instance

                # Determine half-day percentage
                if (
                    instance.start_date == date
                    and instance.start_date_breakdown == "first_half"
                ) or (
                    instance.end_date == date
                    and instance.end_date_breakdown == "second_half"
                ):
                    work_entry.day_percentage = 0.50
                    work_entry.work_record_type = "CONF"
                    work_entry.message = _("Half day Attendance need to validate")
                else:
                    work_entry.day_percentage = 0.00
                    work_entry.work_record_type = "ABS"
                    work_entry.message = "Leave"

                work_entry.date = date
                work_entry.save()
        else:
            # Remove work records if leave is not approved
            for date in period_dates:
                qs = WorkRecords.objects.filter(
                    is_leave_record=True,
                    date=date,
                    employee_id=instance.employee_id,
                )
                ids = list(qs.values_list("id", flat=True))
                if ids:
                    WorkRecords.objects.filter(id__in=ids).delete()

    @receiver(pre_delete, sender=LeaveRequest)
    def leaverequest_pre_delete(sender, instance, **kwargs):
        """
        Remove associated WorkRecords when a LeaveRequest is deleted.
        """
        if not apps.is_installed("attendance"):
            return

        WorkRecords = get_horilla_model_class(
            app_label="attendance", model="workrecords"
        )
        qs = WorkRecords.objects.filter(leave_request_id=instance)
        ids = list(qs.values_list("id", flat=True))
        if ids:
            WorkRecords.objects.filter(id__in=ids).delete()
