if(NOT TARGET hermes-engine::libhermes)
add_library(hermes-engine::libhermes SHARED IMPORTED)
set_target_properties(hermes-engine::libhermes PROPERTIES
    IMPORTED_LOCATION "C:/Users/Oscar/.gradle/caches/8.13/transforms/24069bc786018bfb37a2a10d5dd60b2c/transformed/hermes-android-0.79.6-debug/prefab/modules/libhermes/libs/android.armeabi-v7a/libhermes.so"
    INTERFACE_INCLUDE_DIRECTORIES "C:/Users/Oscar/.gradle/caches/8.13/transforms/24069bc786018bfb37a2a10d5dd60b2c/transformed/hermes-android-0.79.6-debug/prefab/modules/libhermes/include"
    INTERFACE_LINK_LIBRARIES ""
)
endif()

