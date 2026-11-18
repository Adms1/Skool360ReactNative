if(NOT TARGET hermes-engine::hermesvm)
add_library(hermes-engine::hermesvm SHARED IMPORTED)
set_target_properties(hermes-engine::hermesvm PROPERTIES
    IMPORTED_LOCATION "D:/Gradle/caches/9.4.1/transforms/be91f863d808de3599c24c12eb4ff62b/transformed/hermes-android-250829098.0.16-debug/prefab/modules/hermesvm/libs/android.x86_64/libhermesvm.so"
    INTERFACE_INCLUDE_DIRECTORIES "D:/Gradle/caches/9.4.1/transforms/be91f863d808de3599c24c12eb4ff62b/transformed/hermes-android-250829098.0.16-debug/prefab/modules/hermesvm/include"
    INTERFACE_LINK_LIBRARIES ""
)
endif()

